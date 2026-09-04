import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import { getOperationalSettings } from '@/lib/domain/operational-settings';
import {
  canBook,
  CANCELLATION_HOURS,
  isMonday,
  isReservationInput,
  reservationInstant,
  type ReservationStatus,
} from '@/lib/domain/reservations';
import { getAdminDatabase } from '@/lib/firebase/admin';
import {
  enqueueReservationEvent,
  dispatchReservationPush,
  issueNotificationAccess,
} from '@/lib/firebase/reservation-notifications';
import { deleteReservation } from '@/lib/firebase/delete-reservation';

const capacityStatuses = new Set<ReservationStatus>([
  'pending_approval',
  'confirmed',
  'presence_confirmed',
  'seated',
]);

function digits(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function serializeReservation(
  id: string,
  data: Record<string, unknown>,
  minAdvanceHours: number,
  lateToleranceMinutes: number,
  restaurantWhatsapp: string,
) {
  const instant = reservationInstant({
    serviceDate: text(data.serviceDate),
    arrivalTime: text(data.arrivalTime),
  });
  const deadline = new Date(
    instant.getTime() - minAdvanceHours * 60 * 60 * 1000,
  );
  const status = text(data.status, 'confirmed');
  const canModify =
    deadline.getTime() >= Date.now() &&
    !['cancelled', 'completed', 'no_show', 'seated'].includes(status);
  return {
    id,
    customerName: text(data.customerName),
    whatsapp: text(data.whatsapp),
    partySize: Number(data.partySize ?? 0),
    service: text(data.service),
    serviceDate: text(data.serviceDate),
    arrivalTime: text(data.arrivalTime),
    notes: text(data.notes),
    status,
    canModify,
    modifyDeadline: deadline.toISOString(),
    lateToleranceMinutes,
    restaurantWhatsapp,
  };
}

async function findReservation(code: unknown, whatsapp: unknown) {
  const database = getAdminDatabase();
  if (!database) return { error: 'FIREBASE' as const };
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  const normalizedWhatsapp = digits(whatsapp);
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(normalizedCode) ||
    normalizedWhatsapp.length < 10
  )
    return { error: 'INVALID' as const };
  const reference = database.collection('reservations').doc(normalizedCode);
  const snapshot = await reference.get();
  if (
    !snapshot.exists ||
    snapshot.data()?.deletedAt ||
    digits(snapshot.data()?.whatsapp) !== normalizedWhatsapp
  )
    return { error: 'NOT_FOUND' as const };
  return { database, reference, snapshot, data: snapshot.data() ?? {} };
}

function lookupError(error: 'FIREBASE' | 'INVALID' | 'NOT_FOUND') {
  if (error === 'FIREBASE')
    return NextResponse.json(
      { error: 'Sistema temporariamente indisponível.' },
      { status: 503 },
    );
  if (error === 'INVALID')
    return NextResponse.json(
      { error: 'Informe o código e o WhatsApp usados na reserva.' },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        'Reserva não encontrada. Confira o código e o WhatsApp informados.',
    },
    { status: 404 },
  );
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const result = await findReservation(payload?.code, payload?.whatsapp);
  if (result.error) return lookupError(result.error);
  const settings = await getOperationalSettings(result.database);
  const notificationToken = await issueNotificationAccess(
    result.database,
    result.reference.id,
  );
  return NextResponse.json(
    {
      notificationToken,
      reservation: serializeReservation(
        result.reference.id,
        result.data,
        CANCELLATION_HOURS,
        settings.lateToleranceMinutes,
        settings.restaurantWhatsapp,
      ),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const result = await findReservation(payload?.code, payload?.whatsapp);
  if (result.error) return lookupError(result.error);

  const action = payload?.action;
  if (!['confirm_presence', 'cancel', 'update'].includes(String(action))) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }
  const settings = await getOperationalSettings(result.database);
  const current = result.data;
  const currentStatus = String(
    current.status ?? 'confirmed',
  ) as ReservationStatus;
  const currentInstant = reservationInstant({
    serviceDate: String(current.serviceDate ?? ''),
    arrivalTime: String(current.arrivalTime ?? ''),
  });
  const outsideDeadline =
    currentInstant.getTime() - Date.now() >=
    CANCELLATION_HOURS * 60 * 60 * 1000;

  if ((action === 'cancel' || action === 'update') && !outsideDeadline) {
    return NextResponse.json(
      {
        error:
          'Alterações pelo site encerram 24 horas antes. Fale com a equipe pelo WhatsApp.',
        manualContactRequired: true,
        restaurantWhatsapp: settings.restaurantWhatsapp,
      },
      { status: 409 },
    );
  }
  if (['cancelled', 'completed', 'no_show', 'seated'].includes(currentStatus)) {
    return NextResponse.json(
      { error: 'Esta reserva não aceita mais alterações.' },
      { status: 409 },
    );
  }

  if (action === 'confirm_presence') {
    if (currentStatus === 'pending_approval')
      return NextResponse.json(
        { error: 'Aguarde a aprovação da equipe antes de confirmar presença.' },
        { status: 409 },
      );
    if (currentStatus !== 'confirmed' && currentStatus !== 'presence_confirmed')
      return NextResponse.json(
        { error: 'Esta reserva não pode ser confirmada agora.' },
        { status: 409 },
      );
    if (currentStatus !== 'presence_confirmed') {
      await result.database.runTransaction(async (batch) => {
        const snapshot = await batch.get(result.reference);
        const fresh = snapshot.data();
        if (
          !fresh ||
          fresh.deletedAt ||
          fresh.whatsapp !== digits(payload?.whatsapp) ||
          fresh.status !== 'confirmed'
        )
          return;
        batch.update(result.reference, {
          status: 'presence_confirmed',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'customer',
        });
        batch.set(result.database.collection('auditLogs').doc(), {
          reservationId: result.reference.id,
          actorType: 'customer',
          actorId: null,
          action: 'reservation_presence_confirmed',
          fromStatus: 'confirmed',
          toStatus: 'presence_confirmed',
          createdAt: FieldValue.serverTimestamp(),
        });
        enqueueReservationEvent(result.database, batch, {
          eventType: 'reservation_presence_confirmed',
          entityType: 'reservation',
          entityId: result.reference.id,
          whatsapp: fresh.whatsapp,
          payload: {
            customerName: fresh.customerName,
            service: fresh.service,
            serviceDate: fresh.serviceDate,
            arrivalTime: fresh.arrivalTime,
            partySize: fresh.partySize,
            reservationCode: result.reference.id,
            lateToleranceMinutes: settings.lateToleranceMinutes,
          },
          staffNotification: { actorType: 'customer' },
        });
      });
    }
  }

  if (action === 'cancel') {
    try {
      await result.database.runTransaction(async (transaction) => {
        const freshReservation = await transaction.get(result.reference);
        if (!freshReservation.exists) throw new Error('NOT_FOUND');
        const freshData = freshReservation.data() ?? {};
        const freshStatus = String(
          freshData.status ?? 'confirmed',
        ) as ReservationStatus;
        if (
          freshData.deletedAt ||
          digits(freshData.whatsapp) !== digits(payload?.whatsapp) ||
          ['cancelled', 'completed', 'no_show', 'seated'].includes(
            freshStatus,
          ) ||
          reservationInstant(
            freshData as { serviceDate: string; arrivalTime: string },
          ).getTime() -
            Date.now() <
            CANCELLATION_HOURS * 3_600_000
        )
          throw new Error('LOCKED');
        const capacityRef = result.database
          .collection('serviceCapacity')
          .doc(`${freshData.serviceDate}_${freshData.service}`);
        const capacitySnapshot = await transaction.get(capacityRef);
        if (capacityStatuses.has(freshStatus)) {
          transaction.set(
            capacityRef,
            {
              heldSeats: Math.max(
                0,
                Number(capacitySnapshot.data()?.heldSeats ?? 0) -
                  Number(freshData.partySize ?? 0),
              ),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        transaction.update(result.reference, {
          status: 'cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: 'customer',
          cancellationActorType: 'customer',
          cancellationReason: 'customer_request',
          cancellationReasonLabel: 'Solicitação do cliente',
          cancellationNote: '',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'customer',
        });
        transaction.set(result.database.collection('auditLogs').doc(), {
          reservationId: result.reference.id,
          actorType: 'customer',
          actorId: null,
          action: 'reservation_cancelled',
          fromStatus: freshStatus,
          toStatus: 'cancelled',
          changes: {
            reason: 'customer_request',
            reasonLabel: 'Solicitação do cliente',
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        enqueueReservationEvent(result.database, transaction, {
          eventType: 'reservation_cancelled',
          entityType: 'reservation',
          entityId: result.reference.id,
          whatsapp: String(freshData.whatsapp ?? ''),
          payload: {
            customerName: String(freshData.customerName ?? ''),
            reservationCode: result.reference.id,
            service: String(freshData.service ?? ''),
            serviceDate: String(freshData.serviceDate ?? ''),
            arrivalTime: String(freshData.arrivalTime ?? ''),
            partySize: Number(freshData.partySize ?? 0),
            fromStatus: freshStatus,
            toStatus: 'cancelled',
          },
          staffNotification: { actorType: 'customer' },
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['LOCKED', 'NOT_FOUND'].includes(error.message)
      )
        return NextResponse.json(
          {
            error:
              'A reserva mudou ou o prazo encerrou. Consulte novamente ou fale com a equipe.',
          },
          { status: 409 },
        );
      throw error;
    }
  }

  if (action === 'update') {
    const reservation = payload?.reservation;
    if (!isReservationInput(reservation))
      return NextResponse.json(
        { error: 'Revise os dados da reserva.' },
        { status: 400 },
      );
    const nextInstant = reservationInstant(reservation);
    if (!canBook(reservation, settings.minAdvanceHours))
      return NextResponse.json(
        {
          error:
            reservation.service === 'rodizio'
              ? 'As reservas para o rodízio encerram às 18h do dia da visita.'
              : `O almoço exige ${settings.minAdvanceHours} horas de antecedência.`,
        },
        { status: 400 },
      );
    const latest = new Date();
    latest.setMonth(latest.getMonth() + settings.maxBookingMonths);
    if (nextInstant.getTime() > latest.getTime())
      return NextResponse.json(
        {
          error: `O calendário está aberto por ${settings.maxBookingMonths} meses.`,
        },
        { status: 400 },
      );
    const arrivalLimit =
      reservation.service === 'almoco'
        ? settings.lunchArrivalLimit
        : settings.dinnerArrivalLimit;
    if (reservation.arrivalTime > arrivalLimit)
      return NextResponse.json(
        { error: `O horário máximo de chegada é ${arrivalLimit}.` },
        { status: 400 },
      );

    const nextKey = `${reservation.serviceDate}_${reservation.service}`;
    const nextCapacityRef = result.database
      .collection('serviceCapacity')
      .doc(nextKey);
    const nextStatus: ReservationStatus =
      reservation.partySize <= settings.autoApprovalLimit
        ? 'confirmed'
        : 'pending_approval';
    try {
      await result.database.runTransaction(async (transaction) => {
        const reservationSnapshot = await transaction.get(result.reference);
        if (!reservationSnapshot.exists) throw new Error('NOT_FOUND');
        const fresh = reservationSnapshot.data() ?? {};
        const freshStatus = String(
          fresh.status ?? 'confirmed',
        ) as ReservationStatus;
        if (
          fresh.deletedAt ||
          digits(fresh.whatsapp) !== digits(payload?.whatsapp) ||
          ['cancelled', 'completed', 'no_show', 'seated'].includes(
            freshStatus,
          ) ||
          reservationInstant(
            fresh as { serviceDate: string; arrivalTime: string },
          ).getTime() -
            Date.now() <
            CANCELLATION_HOURS * 3_600_000
        )
          throw new Error('LOCKED');
        const previousKey = `${fresh.serviceDate}_${fresh.service}`;
        const previousCapacityRef = result.database
          .collection('serviceCapacity')
          .doc(previousKey);
        const previousCapacitySnapshot =
          await transaction.get(previousCapacityRef);
        const nextCapacitySnapshot =
          previousKey === nextKey
            ? previousCapacitySnapshot
            : await transaction.get(nextCapacityRef);
        const specialDateSnapshot = await transaction.get(
          result.database.collection('specialDates').doc(nextKey),
        );
        const specialDate = specialDateSnapshot.data();
        if (
          specialDate?.isOpen === false ||
          (isMonday(reservation.serviceDate) && specialDate?.isOpen !== true)
        )
          throw new Error('CLOSED_DATE');
        const previousSeats = capacityStatuses.has(freshStatus)
          ? Number(fresh.partySize ?? 0)
          : 0;
        if (previousKey === nextKey) {
          const adjusted = Math.max(
            0,
            Number(previousCapacitySnapshot.data()?.heldSeats ?? 0) -
              previousSeats +
              reservation.partySize,
          );
          if (adjusted > settings.capacityPerService)
            throw new Error('CAPACITY_EXCEEDED');
          transaction.set(
            previousCapacityRef,
            {
              serviceDate: reservation.serviceDate,
              service: reservation.service,
              limit: settings.capacityPerService,
              heldSeats: adjusted,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          const nextHeld = Number(nextCapacitySnapshot.data()?.heldSeats ?? 0);
          if (nextHeld + reservation.partySize > settings.capacityPerService)
            throw new Error('CAPACITY_EXCEEDED');
          transaction.set(
            previousCapacityRef,
            {
              heldSeats: Math.max(
                0,
                Number(previousCapacitySnapshot.data()?.heldSeats ?? 0) -
                  previousSeats,
              ),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          transaction.set(
            nextCapacityRef,
            {
              serviceDate: reservation.serviceDate,
              service: reservation.service,
              limit: settings.capacityPerService,
              heldSeats: nextHeld + reservation.partySize,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        const updated = {
          customerName: reservation.customerName.trim(),
          whatsapp: digits(reservation.whatsapp),
          partySize: reservation.partySize,
          service: reservation.service,
          serviceDate: reservation.serviceDate,
          arrivalTime: reservation.arrivalTime,
          notes: reservation.notes?.trim().slice(0, 1000) ?? '',
          status: nextStatus,
        };
        transaction.update(result.reference, {
          ...updated,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'customer',
        });
        transaction.set(result.database.collection('auditLogs').doc(), {
          reservationId: result.reference.id,
          actorType: 'customer',
          actorId: null,
          action: 'reservation_updated_by_customer',
          fromStatus: freshStatus,
          toStatus: nextStatus,
          changes: { before: fresh, after: updated },
          createdAt: FieldValue.serverTimestamp(),
        });
        const reservationDetailsChanged =
          String(fresh.customerName ?? '') !== updated.customerName ||
          digits(fresh.whatsapp) !== updated.whatsapp ||
          Number(fresh.partySize ?? 0) !== updated.partySize ||
          String(fresh.service ?? '') !== updated.service ||
          String(fresh.serviceDate ?? '') !== updated.serviceDate ||
          String(fresh.arrivalTime ?? '') !== updated.arrivalTime ||
          String(fresh.notes ?? '') !== updated.notes;
        if (reservationDetailsChanged) {
          enqueueReservationEvent(result.database, transaction, {
            eventType: 'reservation_updated',
            entityType: 'reservation',
            entityId: result.reference.id,
            whatsapp: updated.whatsapp,
            payload: {
              customerName: updated.customerName,
              whatsapp: updated.whatsapp,
              reservationCode: result.reference.id,
              lateToleranceMinutes: settings.lateToleranceMinutes,
              service: updated.service,
              serviceDate: updated.serviceDate,
              arrivalTime: updated.arrivalTime,
              partySize: updated.partySize,
              notes: updated.notes,
              fromStatus: freshStatus,
              toStatus: nextStatus,
              previous: {
                customerName: String(fresh.customerName ?? ''),
                whatsapp: String(fresh.whatsapp ?? ''),
                service: String(fresh.service ?? ''),
                serviceDate: String(fresh.serviceDate ?? ''),
                arrivalTime: String(fresh.arrivalTime ?? ''),
                partySize: Number(fresh.partySize ?? 0),
                notes: String(fresh.notes ?? ''),
              },
            },
            staffNotification: { actorType: 'customer' },
          });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'CAPACITY_EXCEEDED')
        return NextResponse.json(
          { error: 'A cota de reservas deste serviço está completa.' },
          { status: 409 },
        );
      if (error instanceof Error && error.message === 'CLOSED_DATE')
        return NextResponse.json(
          { error: 'O restaurante não recebe reservas nessa data.' },
          { status: 409 },
        );
      if (
        error instanceof Error &&
        ['NOT_FOUND', 'LOCKED'].includes(error.message)
      )
        return NextResponse.json(
          { error: 'Esta reserva não aceita mais alterações.' },
          { status: 409 },
        );
      throw error;
    }
  }

  const updatedSnapshot = await result.reference.get();
  after(() => dispatchReservationPush(result.database, result.reference.id));
  return NextResponse.json({
    reservation: serializeReservation(
      result.reference.id,
      updatedSnapshot.data() ?? {},
      CANCELLATION_HOURS,
      settings.lateToleranceMinutes,
      settings.restaurantWhatsapp,
    ),
  });
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => null);
  const result = await findReservation(payload?.code, payload?.whatsapp);
  if (result.error) return lookupError(result.error);
  try {
    await deleteReservation(result.database, result.reference.id, {
      type: 'customer',
      id: null,
      whatsapp: digits(payload.whatsapp),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DEADLINE')
      return NextResponse.json(
        {
          error:
            'A exclusão pelo site encerra 24 horas antes. Fale com a equipe pelo WhatsApp.',
        },
        { status: 409 },
      );
    if (error instanceof Error && error.message === 'NOT_FOUND')
      return lookupError('NOT_FOUND');
    throw error;
  }
  after(() => dispatchReservationPush(result.database, result.reference.id));
  return NextResponse.json({ ok: true });
}
