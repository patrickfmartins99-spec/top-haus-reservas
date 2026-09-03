import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import {
  isMonday,
  isReservationInput,
  reservationInstant,
  type ReservationStatus,
} from '@/lib/domain/reservations';
import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { createWhatsAppOutboxEvent, type WhatsAppEventType } from '@/lib/firebase/whatsapp-outbox';

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
      if (!reservationSnapshot.exists) throw new Error('NOT_FOUND');

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
      const eventType: WhatsAppEventType = status === 'confirmed' && previousStatus === 'pending_approval'
        ? 'reservation_approved'
        : status === 'cancelled'
          ? 'reservation_cancelled'
          : status === 'no_show'
            ? 'reservation_no_show'
            : 'reservation_updated';
      transaction.set(database.collection('whatsappQueue').doc(), createWhatsAppOutboxEvent({
        eventType,
        entityType: 'reservation',
        entityId: id,
        whatsapp: updatedReservation.whatsapp,
        payload: {
          customerName: updatedReservation.customerName,
          service: updatedReservation.service,
          serviceDate: updatedReservation.serviceDate,
          arrivalTime: updatedReservation.arrivalTime,
          partySize: updatedReservation.partySize,
          reservationCode: id,
          fromStatus: previousStatus,
          toStatus: status,
        },
      }));
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

  return NextResponse.json({ ok: true });
}
