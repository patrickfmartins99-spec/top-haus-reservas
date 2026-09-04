import { createHash, randomBytes } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import {
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

  const settings = await getOperationalSettings(database);
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
  const arrivalLimit =
    payload.service === 'almoco'
      ? settings.lunchArrivalLimit
      : settings.dinnerArrivalLimit;
  if (payload.arrivalTime > arrivalLimit) {
    return NextResponse.json(
      { error: `O horário máximo de chegada é ${arrivalLimit}.` },
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
  const reservationRef = database.collection('reservations').doc();
  const auditRef = database.collection('auditLogs').doc();

  try {
    await database.runTransaction(async (transaction) => {
      const [capacitySnapshot, specialDateSnapshot] = await Promise.all([
        transaction.get(capacityRef),
        transaction.get(specialDateRef),
      ]);

      const specialDate = specialDateSnapshot.data();
      if (
        specialDate?.isOpen === false ||
        (isMonday(payload.serviceDate) && specialDate?.isOpen !== true)
      ) {
        throw new Error('CLOSED_DATE');
      }

      const heldSeats = Number(capacitySnapshot.data()?.heldSeats ?? 0);
      if (heldSeats + payload.partySize > settings.capacityPerService) {
        throw new Error('CAPACITY_EXCEEDED');
      }

      transaction.set(
        capacityRef,
        {
          serviceDate: payload.serviceDate,
          service: payload.service,
          limit: settings.capacityPerService,
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
        whatsapp: payload.whatsapp.replace(/\D/g, ''),
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
    throw error;
  }

  after(() => dispatchReservationPush(database, reservationRef.id));
  return NextResponse.json(
    { id: reservationRef.id, token, status },
    { status: 201 },
  );
}
