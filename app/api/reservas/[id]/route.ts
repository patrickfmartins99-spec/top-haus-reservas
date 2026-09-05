import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import {
  ALLOWED_TIMES,
  isMonday,
  isReservationInput,
  reservationInstant,
  type ReservationStatus,
} from '@/lib/domain/reservations';
import {
  outcomeReason,
  RESERVATION_CANCELLATION_REASONS,
  RESERVATION_NO_SHOW_REASONS,
} from '@/lib/domain/service-outcomes';
import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { type WhatsAppEventType } from '@/lib/firebase/whatsapp-outbox';
import {
  enqueueReservationEvent,
  dispatchReservationPush,
} from '@/lib/firebase/reservation-notifications';
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

export async function PATCH(
  request: Request,
  { params }: RouteContext<'/api/reservas/[id]'>,
) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (payload?.action === 'assign_table') {
    if (
      typeof payload.tableLabel !== 'string' ||
      payload.tableLabel.trim().length > 40
    )
      return NextResponse.json(
        { error: 'Informe uma mesa com até 40 caracteres.' },
        { status: 400 },
      );
    const db = getAdminDatabase();
    if (!db)
      return NextResponse.json(
        { error: 'Sistema indisponível.' },
        { status: 503 },
      );
    const { id } = await params;
    const ref = db.collection('reservations').doc(id);
    try {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists || current.data()?.deletedAt)
          throw new Error('NOT_FOUND');
        const tableLabel = (payload.tableLabel as string).trim();
        const before = String(current.data()?.tableLabel ?? '');
        if (before === tableLabel) return;
        tx.update(ref, {
          tableLabel,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: context.decodedToken.uid,
        });
        tx.set(db.collection('auditLogs').doc(), {
          reservationId: id,
          actorType: 'staff',
          actorId: context.decodedToken.uid,
          action: 'reservation_table_assigned',
          changes: { before: { tableLabel: before }, after: { tableLabel } },
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND')
        return NextResponse.json(
          { error: 'Reserva não encontrada.' },
          { status: 404 },
        );
      throw error;
    }
    return NextResponse.json({
      ok: true,
      tableLabel: payload.tableLabel.trim(),
    });
  }
  if (payload?.action === 'set_status') {
    const status =
      payload.status === 'seated' || payload.status === 'no_show'
        ? payload.status
        : null;
    if (!status)
      return NextResponse.json(
        { error: 'Situação inválida.' },
        { status: 400 },
      );

    let outcome: ReturnType<typeof outcomeReason> | null = null;
    try {
      if (status === 'no_show') {
        outcome = outcomeReason(
          payload.reason,
          RESERVATION_NO_SHOW_REASONS,
          payload.note,
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error &&
            error.message === 'REASON_DETAILS_REQUIRED'
              ? 'Descreva o outro motivo.'
              : 'Selecione o motivo do não comparecimento.',
        },
        { status: 400 },
      );
    }

    const database = getAdminDatabase();
    if (!database)
      return NextResponse.json(
        { error: 'Sistema indisponível.' },
        { status: 503 },
      );
    const { id } = await params;
    const reservationRef = database.collection('reservations').doc(id);

    try {
      await database.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reservationRef);
        if (!snapshot.exists || snapshot.data()?.deletedAt)
          throw new Error('NOT_FOUND');
        const previous = snapshot.data() ?? {};
        const previousStatus = String(
          previous.status ?? 'confirmed',
        ) as ReservationStatus;
        if (previousStatus === status) return;
        if (
          ['cancelled', 'completed', 'seated', 'no_show'].includes(
            previousStatus,
          )
        ) {
          throw new Error('INVALID_TRANSITION');
        }

        if (status === 'no_show' && capacityStatuses.has(previousStatus)) {
          const capacityRef = database
            .collection('serviceCapacity')
            .doc(
              `${String(previous.serviceDate ?? '')}_${String(previous.service ?? '')}`,
            );
          const capacity = await transaction.get(capacityRef);
          transaction.set(
            capacityRef,
            {
              heldSeats: Math.max(
                0,
                Number(capacity.data()?.heldSeats ?? 0) -
                  Number(previous.partySize ?? 0),
              ),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        const outcomeFields =
          status === 'no_show' && outcome
            ? {
                noShowAt: FieldValue.serverTimestamp(),
                noShowBy: context.decodedToken.uid,
                outcomeReason: outcome.reason,
                outcomeReasonLabel: outcome.reasonLabel,
                outcomeNote: outcome.note,
              }
            : {
                seatedAt: FieldValue.serverTimestamp(),
              };
        transaction.update(reservationRef, {
          status,
          ...outcomeFields,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: context.decodedToken.uid,
        });
        transaction.set(database.collection('auditLogs').doc(), {
          reservationId: id,
          actorType: 'staff',
          actorId: context.decodedToken.uid,
          action:
            status === 'seated' ? 'reservation_arrived' : 'reservation_no_show',
          fromStatus: previousStatus,
          toStatus: status,
          changes: outcome
            ? {
                reason: outcome.reason,
                reasonLabel: outcome.reasonLabel,
                note: outcome.note,
              }
            : {},
          createdAt: FieldValue.serverTimestamp(),
        });
        enqueueReservationEvent(database, transaction, {
          eventType:
            status === 'seated' ? 'reservation_seated' : 'reservation_no_show',
          entityType: 'reservation',
          entityId: id,
          whatsapp: String(previous.whatsapp ?? ''),
          payload: {
            customerName: String(previous.customerName ?? ''),
            service: String(previous.service ?? ''),
            serviceDate: String(previous.serviceDate ?? ''),
            arrivalTime: String(previous.arrivalTime ?? ''),
            partySize: Number(previous.partySize ?? 0),
            reservationCode: id,
            fromStatus: previousStatus,
            toStatus: status,
          },
          staffNotification: {
            actorType: 'staff',
            actorName: context.user?.displayName ?? context.decodedToken.name,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        return NextResponse.json(
          { error: 'Reserva não encontrada.' },
          { status: 404 },
        );
      }
      if (error instanceof Error && error.message === 'INVALID_TRANSITION') {
        return NextResponse.json(
          { error: 'Esta reserva já foi encerrada.' },
          { status: 409 },
        );
      }
      throw error;
    }

    after(() => dispatchReservationPush(database, id));
    return NextResponse.json({ ok: true, status });
  }
  if (!payload || !isReservationInput(payload)) {
    return NextResponse.json(
      { error: 'Revise os dados informados para a reserva.' },
      { status: 400 },
    );
  }

  const status =
    typeof payload.status === 'string' &&
    allowedStatuses.includes(payload.status as ReservationStatus)
      ? (payload.status as ReservationStatus)
      : null;
  if (!status)
    return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
  let outcome: ReturnType<typeof outcomeReason> | null = null;
  try {
    if (status === 'cancelled') {
      outcome = outcomeReason(
        payload.cancellationReason,
        RESERVATION_CANCELLATION_REASONS,
        payload.cancellationNote,
      );
    } else if (status === 'no_show') {
      outcome = outcomeReason(
        payload.outcomeReason,
        RESERVATION_NO_SHOW_REASONS,
        payload.outcomeNote,
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === 'REASON_DETAILS_REQUIRED'
            ? 'Descreva o outro motivo.'
            : 'Selecione um motivo para encerrar a reserva.',
      },
      { status: 400 },
    );
  }
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const settings = await getOperationalSettings(database);
  const latest = new Date();
  latest.setMonth(latest.getMonth() + settings.maxBookingMonths);
  if (reservationInstant(payload).getTime() > latest.getTime()) {
    return NextResponse.json(
      {
        error: `A reserva pode ficar aberta com até ${settings.maxBookingMonths} meses de antecedência.`,
      },
      { status: 400 },
    );
  }
  const { id } = await params;
  const reservationRef = database.collection('reservations').doc(id);
  const nextWhatsapp = payload.whatsapp.replace(/\D/g, '');
  const duplicateKey = createHash('sha256')
    .update(`${nextWhatsapp}|${payload.serviceDate}|${payload.service}`)
    .digest('hex');
  const duplicateCandidates = await database
    .collection('reservations')
    .where('whatsapp', '==', nextWhatsapp)
    .limit(50)
    .get();
  if (
    duplicateCandidates.docs.some((document) => {
      if (document.id === id) return false;
      const data = document.data();
      return (
        !data.deletedAt &&
        data.serviceDate === payload.serviceDate &&
        data.service === payload.service &&
        !['cancelled', 'no_show', 'completed'].includes(String(data.status))
      );
    })
  ) {
    return NextResponse.json(
      {
        error:
          'Já existe outra reserva ativa para este WhatsApp, data e serviço.',
        duplicate: true,
      },
      { status: 409 },
    );
  }

  try {
    await database.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists || reservationSnapshot.data()?.deletedAt)
        throw new Error('NOT_FOUND');

      const previous = reservationSnapshot.data() ?? {};
      const previousStatus = String(
        previous.status ?? 'confirmed',
      ) as ReservationStatus;
      const previousPartySize = Number(previous.partySize ?? 0);
      const previousKey = `${String(previous.serviceDate ?? '')}_${String(previous.service ?? '')}`;
      const nextKey = `${payload.serviceDate}_${payload.service}`;
      const previousHeldSeats = capacityStatuses.has(previousStatus)
        ? previousPartySize
        : 0;
      const nextHeldSeats = capacityStatuses.has(status)
        ? payload.partySize
        : 0;

      const previousCapacityRef = database
        .collection('serviceCapacity')
        .doc(previousKey);
      const nextCapacityRef = database
        .collection('serviceCapacity')
        .doc(nextKey);
      const movingService = previousKey !== nextKey;
      const scheduleChanged =
        movingService ||
        String(previous.arrivalTime ?? '') !== payload.arrivalTime;
      const shouldValidateOpening = scheduleChanged && nextHeldSeats > 0;

      const previousCapacitySnapshot =
        await transaction.get(previousCapacityRef);
      const nextCapacitySnapshot = movingService
        ? await transaction.get(nextCapacityRef)
        : previousCapacitySnapshot;
      const specialDateSnapshot = await transaction.get(
        database.collection('specialDates').doc(nextKey),
      );
      const duplicateRef = database
        .collection('reservationDedup')
        .doc(duplicateKey);
      const duplicateSnapshot = await transaction.get(duplicateRef);

      const specialDate = specialDateSnapshot.data();
      if (shouldValidateOpening) {
        if (
          specialDate?.isOpen === false ||
          (isMonday(payload.serviceDate) && specialDate?.isOpen !== true)
        ) {
          throw new Error('CLOSED_DATE');
        }
        if (specialDate?.bookingPaused === true)
          throw new Error(
            `PAUSED_DATE:${String(specialDate.customerNotice ?? '')}`,
          );
      }

      const allowedTimes =
        Array.isArray(specialDate?.arrivalTimes) &&
        specialDate.arrivalTimes.length
          ? specialDate.arrivalTimes
          : ALLOWED_TIMES[payload.service];
      const arrivalLimit =
        payload.service === 'almoco'
          ? settings.lunchArrivalLimit
          : settings.dinnerArrivalLimit;
      if (!allowedTimes.includes(payload.arrivalTime))
        throw new Error('INVALID_SPECIAL_TIME');
      if (
        !specialDate?.arrivalTimes?.length &&
        payload.arrivalTime > arrivalLimit
      )
        throw new Error(`ARRIVAL_LIMIT:${arrivalLimit}`);

      if (duplicateSnapshot.exists) {
        const duplicateReservationId = String(
          duplicateSnapshot.data()?.reservationId ?? '',
        );
        if (duplicateReservationId && duplicateReservationId !== id) {
          const duplicateReservation = await transaction.get(
            database.collection('reservations').doc(duplicateReservationId),
          );
          const duplicateData = duplicateReservation.data();
          if (
            duplicateReservation.exists &&
            !duplicateData?.deletedAt &&
            duplicateData?.whatsapp === nextWhatsapp &&
            duplicateData?.serviceDate === payload.serviceDate &&
            duplicateData?.service === payload.service &&
            !['cancelled', 'no_show', 'completed'].includes(
              String(duplicateData?.status),
            )
          )
            throw new Error('DUPLICATE_RESERVATION');
        }
      }

      const effectiveCapacity =
        Number.isInteger(Number(specialDate?.capacityLimit)) &&
        Number(specialDate?.capacityLimit) > 0
          ? Number(specialDate?.capacityLimit)
          : settings.capacityPerService;

      if (movingService) {
        const currentNextHeldSeats = Number(
          nextCapacitySnapshot.data()?.heldSeats ?? 0,
        );
        if (currentNextHeldSeats + nextHeldSeats > effectiveCapacity)
          throw new Error('CAPACITY_EXCEEDED');

        transaction.set(
          previousCapacityRef,
          {
            heldSeats: Math.max(
              0,
              Number(previousCapacitySnapshot.data()?.heldSeats ?? 0) -
                previousHeldSeats,
            ),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        transaction.set(
          nextCapacityRef,
          {
            serviceDate: payload.serviceDate,
            service: payload.service,
            limit: effectiveCapacity,
            heldSeats: currentNextHeldSeats + nextHeldSeats,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        const currentHeldSeats = Number(
          previousCapacitySnapshot.data()?.heldSeats ?? 0,
        );
        const adjustedHeldSeats = Math.max(
          0,
          currentHeldSeats - previousHeldSeats + nextHeldSeats,
        );
        if (
          adjustedHeldSeats > effectiveCapacity &&
          adjustedHeldSeats > currentHeldSeats
        )
          throw new Error('CAPACITY_EXCEEDED');
        transaction.set(
          previousCapacityRef,
          {
            serviceDate: payload.serviceDate,
            service: payload.service,
            limit: effectiveCapacity,
            heldSeats: adjustedHeldSeats,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      const updatedReservation = {
        customerName: payload.customerName.trim(),
        whatsapp: nextWhatsapp,
        partySize: payload.partySize,
        service: payload.service,
        serviceDate: payload.serviceDate,
        arrivalTime: payload.arrivalTime,
        notes: payload.notes?.trim().slice(0, 1000) ?? '',
        status,
      };

      transaction.update(reservationRef, {
        ...updatedReservation,
        ...(status === 'cancelled' && outcome
          ? {
              cancellationActorType: 'staff',
              cancellationReason: outcome.reason,
              cancellationReasonLabel: outcome.reasonLabel,
              cancellationNote: outcome.note,
              ...(previousStatus !== 'cancelled'
                ? {
                    cancelledAt: FieldValue.serverTimestamp(),
                    cancelledBy: context.decodedToken.uid,
                  }
                : {}),
            }
          : {}),
        ...(status === 'no_show' && outcome
          ? {
              outcomeReason: outcome.reason,
              outcomeReasonLabel: outcome.reasonLabel,
              outcomeNote: outcome.note,
              ...(previousStatus !== 'no_show'
                ? {
                    noShowAt: FieldValue.serverTimestamp(),
                    noShowBy: context.decodedToken.uid,
                  }
                : {}),
            }
          : {}),
        ...(status === 'seated' && previousStatus !== 'seated'
          ? {
              seatedAt: FieldValue.serverTimestamp(),
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.decodedToken.uid,
      });
      transaction.set(duplicateRef, {
        reservationId: id,
        whatsapp: nextWhatsapp,
        serviceDate: payload.serviceDate,
        service: payload.service,
        updatedAt: FieldValue.serverTimestamp(),
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
          ...(outcome
            ? {
                reason: outcome.reason,
                reasonLabel: outcome.reasonLabel,
                note: outcome.note,
              }
            : {}),
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      const reservationDetailsChanged =
        String(previous.customerName ?? '') !==
          updatedReservation.customerName ||
        String(previous.whatsapp ?? '').replace(/\D/g, '') !==
          updatedReservation.whatsapp ||
        previousPartySize !== updatedReservation.partySize ||
        String(previous.service ?? '') !== updatedReservation.service ||
        String(previous.serviceDate ?? '') !== updatedReservation.serviceDate ||
        String(previous.arrivalTime ?? '') !== updatedReservation.arrivalTime ||
        String(previous.notes ?? '') !== updatedReservation.notes;
      const eventType: WhatsAppEventType | null =
        status === 'confirmed' && previousStatus === 'pending_approval'
          ? 'reservation_approved'
          : status === 'cancelled' && previousStatus !== 'cancelled'
            ? 'reservation_cancelled'
            : status === 'no_show' && previousStatus !== status
              ? 'reservation_no_show'
              : status === 'presence_confirmed' && previousStatus !== status
                ? 'reservation_presence_confirmed'
                : status === 'seated' && previousStatus !== status
                  ? 'reservation_seated'
                  : status === 'completed' && previousStatus !== status
                    ? 'reservation_completed'
                    : status !== 'cancelled' &&
                        (reservationDetailsChanged || previousStatus !== status)
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
          staffNotification: {
            actorType: 'staff',
            actorName: context.user?.displayName ?? context.decodedToken.name,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Reserva não encontrada.' },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === 'CLOSED_DATE') {
      return NextResponse.json(
        { error: 'O restaurante não recebe reservas nessa nova data.' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'CAPACITY_EXCEEDED') {
      return NextResponse.json(
        {
          error: `A alteração ultrapassa a cota de ${settings.capacityPerService} lugares desse serviço.`,
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'DUPLICATE_RESERVATION') {
      return NextResponse.json(
        {
          error:
            'Já existe outra reserva ativa para este WhatsApp, data e serviço.',
          duplicate: true,
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'INVALID_SPECIAL_TIME') {
      return NextResponse.json(
        { error: 'O horário escolhido não está disponível nesta data.' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message.startsWith('ARRIVAL_LIMIT:')) {
      return NextResponse.json(
        {
          error: `O horário máximo de chegada é ${error.message.slice('ARRIVAL_LIMIT:'.length)}.`,
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.startsWith('PAUSED_DATE:')) {
      return NextResponse.json(
        {
          error:
            error.message.slice('PAUSED_DATE:'.length) ||
            'As reservas estão temporariamente suspensas nesta data.',
        },
        { status: 409 },
      );
    }
    throw error;
  }

  after(() => dispatchReservationPush(database, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: RouteContext<'/api/reservas/[id]'>,
) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );
  const db = getAdminDatabase();
  if (!db)
    return NextResponse.json(
      { error: 'Sistema indisponível.' },
      { status: 503 },
    );
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  try {
    await deleteReservation(db, id, {
      type: 'staff',
      id: context.decodedToken.uid,
      name: context.user?.displayName ?? context.decodedToken.name,
      reason: typeof payload?.reason === 'string' ? payload.reason : '',
      note: typeof payload?.note === 'string' ? payload.note : '',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND')
      return NextResponse.json(
        { error: 'Reserva não encontrada.' },
        { status: 404 },
      );
    if (error instanceof Error && error.message === 'REASON_REQUIRED')
      return NextResponse.json(
        { error: 'Selecione o motivo do cancelamento.' },
        { status: 400 },
      );
    if (error instanceof Error && error.message === 'REASON_DETAILS_REQUIRED')
      return NextResponse.json(
        { error: 'Descreva o outro motivo.' },
        { status: 400 },
      );
    throw error;
  }
  after(() => dispatchReservationPush(db, id));
  return NextResponse.json({ ok: true });
}
