import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import {
  isMonday,
  isReservationInput,
  reservationInstant,
  type ReservationStatus,
} from '@/lib/domain/reservations';
import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { type WhatsAppEventType } from '@/lib/firebase/whatsapp-outbox';
import { enqueueReservationEvent, dispatchReservationPush } from '@/lib/firebase/reservation-notifications';
import { deleteReservation } from '@/lib/firebase/delete-reservation';

const allowedStatuses: ReservationStatus[] = [
  'pending_approval',
  'confirmed',
  'presence_confirmed',
  'cancelled',
  'seated',
  'no_show',
  'completed',
];

const capacityStatuses = new Set<ReservationStatus>([
  'pending_approval',
  'confirmed',
  'presence_confirmed',
  'seated',
]);

export async function PATCH(request: Request, { params }: RouteContext<'/api/reservas/[id]'>) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (payload?.action === 'assign_table') {
    if (typeof payload.tableLabel !== 'string' || payload.tableLabel.trim().length > 40) return NextResponse.json({ error: 'Informe uma mesa com até 40 caracteres.' }, { status: 400 });
    const db = getAdminDatabase();
    if (!db) return NextResponse.json({ error: 'Sistema indisponível.' }, { status: 503 });
    const { id } = await params;
    const ref = db.collection('reservations').doc(id);
    try {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists || current.data()?.deletedAt) throw new Error('NOT_FOUND');
        const tableLabel = (payload.tableLabel as string).trim();
        const before = String(current.data()?.tableLabel ?? '');
        if (before === tableLabel) return;
        tx.update(ref, { tableLabel, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.decodedToken.uid });
        tx.set(db.collection('auditLogs').doc(), { reservationId: id, actorType: 'staff', actorId: context.decodedToken.uid, action: 'reservation_table_assigned', changes: { before: { tableLabel: before }, after: { tableLabel } }, createdAt: FieldValue.serverTimestamp() });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
      throw error;
    }
    return NextResponse.json({ ok: true, tableLabel: payload.tableLabel.trim() });
  }
  if (!payload || !isReservationInput(payload)) {
    return NextResponse.json({ error: 'Revise os dados informados para a reserva.' }, { status: 400 });
  }

  const status = typeof payload.status === 'string' && allowedStatuses.includes(payload.status as ReservationStatus)
    ? payload.status as ReservationStatus
    : null;
  if (!status) return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const settings = await getOperationalSettings(database);
  const latest = new Date();
  latest.setMonth(latest.getMonth() + settings.maxBookingMonths);
  if (reservationInstant(payload).getTime() > latest.getTime()) {
    return NextResponse.json({ error: `A reserva pode ficar aberta com até ${settings.maxBookingMonths} meses de antecedência.` }, { status: 400 });
  }
  const arrivalLimit = payload.service === 'almoco' ? settings.lunchArrivalLimit : settings.dinnerArrivalLimit;
  if (payload.arrivalTime > arrivalLimit) {
    return NextResponse.json({ error: `O horário máximo de chegada é ${arrivalLimit}.` }, { status: 400 });
  }

  const { id } = await params;
  const reservationRef = database.collection('reservations').doc(id);

  try {
    await database.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists || reservationSnapshot.data()?.deletedAt) throw new Error('NOT_FOUND');

      const previous = reservationSnapshot.data() ?? {};
      const previousStatus = String(previous.status ?? 'confirmed') as ReservationStatus;
      const previousPartySize = Number(previous.partySize ?? 0);
      const previousKey = `${String(previous.serviceDate ?? '')}_${String(previous.service ?? '')}`;
      const nextKey = `${payload.serviceDate}_${payload.service}`;
      const previousHeldSeats = capacityStatuses.has(previousStatus) ? previousPartySize : 0;
      const nextHeldSeats = capacityStatuses.has(status) ? payload.partySize : 0;

      const previousCapacityRef = database.collection('serviceCapacity').doc(previousKey);
      const nextCapacityRef = database.collection('serviceCapacity').doc(nextKey);
      const movingService = previousKey !== nextKey;
      const shouldValidateOpening = movingService && nextHeldSeats > 0;

      const previousCapacitySnapshot = await transaction.get(previousCapacityRef);
      const nextCapacitySnapshot = movingService ? await transaction.get(nextCapacityRef) : previousCapacitySnapshot;
      const specialDateSnapshot = shouldValidateOpening
        ? await transaction.get(database.collection('specialDates').doc(nextKey))
        : null;

      if (shouldValidateOpening) {
        const specialDate = specialDateSnapshot?.data();
        if (specialDate?.isOpen === false || (isMonday(payload.serviceDate) && specialDate?.isOpen !== true)) {
          throw new Error('CLOSED_DATE');
        }
      }

      if (movingService) {
        const currentNextHeldSeats = Number(nextCapacitySnapshot.data()?.heldSeats ?? 0);
        if (currentNextHeldSeats + nextHeldSeats > settings.capacityPerService) throw new Error('CAPACITY_EXCEEDED');

        transaction.set(previousCapacityRef, {
          heldSeats: Math.max(0, Number(previousCapacitySnapshot.data()?.heldSeats ?? 0) - previousHeldSeats),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(nextCapacityRef, {
          serviceDate: payload.serviceDate,
          service: payload.service,
          limit: settings.capacityPerService,
          heldSeats: currentNextHeldSeats + nextHeldSeats,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        const currentHeldSeats = Number(previousCapacitySnapshot.data()?.heldSeats ?? 0);
        const adjustedHeldSeats = Math.max(0, currentHeldSeats - previousHeldSeats + nextHeldSeats);
        if (adjustedHeldSeats > settings.capacityPerService) throw new Error('CAPACITY_EXCEEDED');
        transaction.set(previousCapacityRef, {
          serviceDate: payload.serviceDate,
          service: payload.service,
          limit: settings.capacityPerService,
          heldSeats: adjustedHeldSeats,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const updatedReservation = {
        customerName: payload.customerName.trim(),
        whatsapp: payload.whatsapp.replace(/\D/g, ''),
        partySize: payload.partySize,
        service: payload.service,
        serviceDate: payload.serviceDate,
        arrivalTime: payload.arrivalTime,
        notes: payload.notes?.trim().slice(0, 1000) ?? '',
        status,
      };

      transaction.update(reservationRef, {
        ...updatedReservation,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.decodedToken.uid,
      });
      transaction.set(database.collection('auditLogs').doc(), {
        reservationId: id,
        actorType: 'staff',
        actorId: context.decodedToken.uid,
        action: 'reservation_updated',
        fromStatus: previousStatus,
        toStatus: status,
        changes: {
          before: {
            customerName: String(previous.customerName ?? ''),
            whatsapp: String(previous.whatsapp ?? ''),
            partySize: previousPartySize,
            service: String(previous.service ?? ''),
            serviceDate: String(previous.serviceDate ?? ''),
            arrivalTime: String(previous.arrivalTime ?? ''),
            notes: String(previous.notes ?? ''),
          },
          after: updatedReservation,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      const reservationDetailsChanged = (
        String(previous.customerName ?? '') !== updatedReservation.customerName ||
        String(previous.whatsapp ?? '').replace(/\D/g, '') !== updatedReservation.whatsapp ||
        previousPartySize !== updatedReservation.partySize ||
        String(previous.service ?? '') !== updatedReservation.service ||
        String(previous.serviceDate ?? '') !== updatedReservation.serviceDate ||
        String(previous.arrivalTime ?? '') !== updatedReservation.arrivalTime ||
        String(previous.notes ?? '') !== updatedReservation.notes
      );
      const eventType: WhatsAppEventType | null = status === 'confirmed' && previousStatus === 'pending_approval'
        ? 'reservation_approved'
        : status === 'cancelled' && previousStatus !== 'cancelled'
          ? 'reservation_cancelled'
          : status === 'no_show' && previousStatus !== status ? 'reservation_no_show'
          : status === 'presence_confirmed' && previousStatus !== status ? 'reservation_presence_confirmed'
          : status === 'seated' && previousStatus !== status ? 'reservation_seated'
          : status === 'completed' && previousStatus !== status ? 'reservation_completed'
          : status !== 'cancelled' && (reservationDetailsChanged || previousStatus !== status)
            ? 'reservation_updated'
            : null;
      if (eventType) {
        enqueueReservationEvent(database, transaction, {
          eventType,
          entityType: 'reservation',
          entityId: id,
          whatsapp: updatedReservation.whatsapp,
          payload: {
            customerName: updatedReservation.customerName,
            whatsapp: updatedReservation.whatsapp,
            service: updatedReservation.service,
            serviceDate: updatedReservation.serviceDate,
            arrivalTime: updatedReservation.arrivalTime,
            partySize: updatedReservation.partySize,
            notes: updatedReservation.notes,
            reservationCode: id,
            lateToleranceMinutes: settings.lateToleranceMinutes,
            fromStatus: previousStatus,
            toStatus: status,
            previous: {
              customerName: String(previous.customerName ?? ''),
              whatsapp: String(previous.whatsapp ?? ''),
              service: String(previous.service ?? ''),
              serviceDate: String(previous.serviceDate ?? ''),
              arrivalTime: String(previous.arrivalTime ?? ''),
              partySize: previousPartySize,
              notes: String(previous.notes ?? ''),
            },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'CLOSED_DATE') {
      return NextResponse.json({ error: 'O restaurante não recebe reservas nessa nova data.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'CAPACITY_EXCEEDED') {
      return NextResponse.json({ error: `A alteração ultrapassa a cota de ${settings.capacityPerService} lugares desse serviço.` }, { status: 409 });
    }
    throw error;
  }

  after(() => dispatchReservationPush(database, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext<'/api/reservas/[id]'>) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const { id } = await params;
  try { await deleteReservation(db, id, { type: 'staff', id: context.decodedToken.uid }); }
  catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Reserva não encontrada.' }, { status: 404 });
    throw error;
  }
  after(() => dispatchReservationPush(db, id));
  return NextResponse.json({ ok: true });
}
