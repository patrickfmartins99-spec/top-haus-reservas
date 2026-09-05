import { createHash, randomBytes } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import {
  ALLOWED_TIMES,
  isMonday,
  isReservationInput,
  reservationInstant,
  canBook,
} from '@/lib/domain/reservations';
import { requireStaff } from '@/lib/auth/staff-request';
import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';
import {
  enqueueReservationEvent,
  dispatchReservationPush,
} from '@/lib/firebase/reservation-notifications';

function serializeTimestamp(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );

  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const snapshot = await database
    .collection('reservations')
    .orderBy('createdAt', 'desc')
    .limit(300)
    .get();
  const reservations = snapshot.docs
    .filter((document) => !document.data().deletedAt)
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        customerName: String(data.customerName ?? ''),
        whatsapp: String(data.whatsapp ?? ''),
        partySize: Number(data.partySize ?? 0),
        service: String(data.service ?? ''),
        serviceDate: String(data.serviceDate ?? ''),
        arrivalTime: String(data.arrivalTime ?? ''),
        notes: String(data.notes ?? ''),
        tableLabel: String(data.tableLabel ?? ''),
        status: String(data.status ?? 'confirmed'),
        source: String(data.source ?? 'customer_web'),
        cancellationReason: String(data.cancellationReason ?? ''),
        cancellationReasonLabel: String(data.cancellationReasonLabel ?? ''),
        cancellationNote: String(data.cancellationNote ?? ''),
        outcomeReason: String(data.outcomeReason ?? ''),
        outcomeReasonLabel: String(data.outcomeReasonLabel ?? ''),
        outcomeNote: String(data.outcomeNote ?? ''),
        createdAt: serializeTimestamp(data.createdAt),
      };
    });

  return NextResponse.json({ reservations });
}

export async function POST(request: Request) {
  const payload: unknown = await request.json().catch(() => null);

  if (!isReservationInput(payload)) {
    return NextResponse.json(
      { error: 'Dados da reserva inválidos.' },
      { status: 400 },
    );
  }
  const database = getAdminDatabase();
  const staffContext = request.headers.get('authorization')
    ? await requireStaff(request)
    : null;
  if (request.headers.get('authorization') && !staffContext) {
    return NextResponse.json(
      { error: 'Sua sessão expirou. Entre novamente.' },
      { status: 403 },
    );
  }
  if (!database) {
    return NextResponse.json(
      { error: 'Firebase não configurado. A reserva não foi salva.' },
      { status: 503 },
    );
  }

  const normalizedWhatsapp = payload.whatsapp.replace(/\D/g, '');
  const duplicateKey = createHash('sha256')
    .update(`${normalizedWhatsapp}|${payload.serviceDate}|${payload.service}`)
    .digest('hex');
  const [settings, possibleDuplicates] = await Promise.all([
    getOperationalSettings(database),
    database
      .collection('reservations')
      .where('whatsapp', '==', normalizedWhatsapp)
      .limit(50)
      .get(),
  ]);
  const duplicate = possibleDuplicates.docs.find((document) => {
    const data = document.data();
    return (
      !data.deletedAt &&
      data.serviceDate === payload.serviceDate &&
      data.service === payload.service &&
      !['cancelled', 'no_show', 'completed'].includes(String(data.status))
    );
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          'Já existe uma reserva ativa para este WhatsApp, data e serviço. Consulte a reserva existente ou fale com a equipe.',
        duplicate: true,
      },
      { status: 409 },
    );
  }
  const instant = reservationInstant(payload);
  if (!canBook(payload, settings.minAdvanceHours)) {
    return NextResponse.json(
      {
        error:
          payload.service === 'rodizio'
            ? 'As reservas para o rodízio encerram às 18h do dia da visita (horário de Brasília).'
            : `A reserva do almoço precisa ser feita com ${settings.minAdvanceHours} horas de antecedência.`,
      },
      { status: 400 },
    );
  }
  const latest = new Date();
  latest.setMonth(latest.getMonth() + settings.maxBookingMonths);
  if (instant.getTime() > latest.getTime()) {
    return NextResponse.json(
      {
        error: `A reserva pode ser feita com até ${settings.maxBookingMonths} meses de antecedência.`,
      },
      { status: 400 },
    );
  }
  const token = randomBytes(24).toString('hex');
  const status =
    payload.partySize <= settings.autoApprovalLimit
      ? 'confirmed'
      : 'pending_approval';

  const serviceKey = `${payload.serviceDate}_${payload.service}`;
  const capacityRef = database.collection('serviceCapacity').doc(serviceKey);
  const specialDateRef = database.collection('specialDates').doc(serviceKey);
  const duplicateRef = database
    .collection('reservationDedup')
    .doc(duplicateKey);
  const reservationRef = database.collection('reservations').doc();
  const auditRef = database.collection('auditLogs').doc();

  try {
    await database.runTransaction(async (transaction) => {
      const [capacitySnapshot, specialDateSnapshot, duplicateSnapshot] =
        await Promise.all([
          transaction.get(capacityRef),
          transaction.get(specialDateRef),
          transaction.get(duplicateRef),
        ]);

      const specialDate = specialDateSnapshot.data();
      if (
        specialDate?.isOpen === false ||
        (isMonday(payload.serviceDate) && specialDate?.isOpen !== true)
      ) {
        throw new Error('CLOSED_DATE');
      }
      if (specialDate?.bookingPaused === true) {
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
      if (!allowedTimes.includes(payload.arrivalTime)) {
        throw new Error('INVALID_SPECIAL_TIME');
      }
      if (
        !specialDate?.arrivalTimes?.length &&
        payload.arrivalTime > arrivalLimit
      )
        throw new Error(`ARRIVAL_LIMIT:${arrivalLimit}`);

      if (duplicateSnapshot.exists) {
        const existingId = String(
          duplicateSnapshot.data()?.reservationId ?? '',
        );
        if (existingId) {
          const existingReservation = await transaction.get(
            database.collection('reservations').doc(existingId),
          );
          const existing = existingReservation.data();
          if (
            existingReservation.exists &&
            !existing?.deletedAt &&
            existing?.whatsapp === normalizedWhatsapp &&
            existing?.serviceDate === payload.serviceDate &&
            existing?.service === payload.service &&
            !['cancelled', 'no_show', 'completed'].includes(
              String(existing?.status),
            )
          )
            throw new Error('DUPLICATE_RESERVATION');
        }
      }

      const heldSeats = Number(capacitySnapshot.data()?.heldSeats ?? 0);
      const effectiveCapacity =
        Number.isInteger(Number(specialDate?.capacityLimit)) &&
        Number(specialDate?.capacityLimit) > 0
          ? Number(specialDate?.capacityLimit)
          : settings.capacityPerService;
      if (heldSeats + payload.partySize > effectiveCapacity) {
        throw new Error('CAPACITY_EXCEEDED');
      }

      transaction.set(
        capacityRef,
        {
          serviceDate: payload.serviceDate,
          service: payload.service,
          limit: effectiveCapacity,
          heldSeats: heldSeats + payload.partySize,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      transaction.set(reservationRef, {
        service: payload.service,
        serviceDate: payload.serviceDate,
        arrivalTime: payload.arrivalTime,
        partySize: payload.partySize,
        customerName: payload.customerName.trim(),
        whatsapp: normalizedWhatsapp,
        notes: payload.notes?.trim().slice(0, 1000) ?? '',
        status,
        source: staffContext ? 'staff_phone' : 'customer_web',
        createdBy: staffContext?.decodedToken.uid ?? null,
        confirmationTokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(auditRef, {
        reservationId: reservationRef.id,
        actorType: staffContext ? 'staff' : 'customer',
        actorId: staffContext?.decodedToken.uid ?? null,
        action: 'reservation_created',
        fromStatus: null,
        toStatus: status,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(duplicateRef, {
        reservationId: reservationRef.id,
        whatsapp: normalizedWhatsapp,
        serviceDate: payload.serviceDate,
        service: payload.service,
        updatedAt: FieldValue.serverTimestamp(),
      });
      enqueueReservationEvent(database, transaction, {
        eventType:
          status === 'confirmed'
            ? 'reservation_confirmed'
            : 'reservation_pending_approval',
        entityType: 'reservation',
        entityId: reservationRef.id,
        whatsapp: payload.whatsapp,
        payload: {
          customerName: payload.customerName.trim(),
          service: payload.service,
          serviceDate: payload.serviceDate,
          arrivalTime: payload.arrivalTime,
          partySize: payload.partySize,
          reservationCode: reservationRef.id,
          status,
          lateToleranceMinutes: settings.lateToleranceMinutes,
        },
        staffNotification: {
          actorType: staffContext ? 'staff' : 'customer',
          actorName:
            staffContext?.user?.displayName ?? staffContext?.decodedToken.name,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CLOSED_DATE') {
      return NextResponse.json(
        { error: 'O restaurante não recebe reservas nessa data.' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'CAPACITY_EXCEEDED') {
      return NextResponse.json(
        {
          error: 'A cota de reservas deste serviço está completa.',
          waitlistAvailable: true,
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'DUPLICATE_RESERVATION') {
      return NextResponse.json(
        {
          error:
            'Já existe uma reserva ativa para este WhatsApp, data e serviço. Consulte a reserva existente ou fale com a equipe.',
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
            'As reservas online estão temporariamente suspensas nesta data.',
        },
        { status: 409 },
      );
    }
    throw error;
  }

  after(() => dispatchReservationPush(database, reservationRef.id));
  return NextResponse.json(
    { id: reservationRef.id, token, status },
    { status: 201 },
  );
}
