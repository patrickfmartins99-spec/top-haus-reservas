import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin-request';
import {
  exceptionFromSnapshot,
  normalizeSpecialDate,
  specialDateId,
} from '@/lib/domain/special-dates';
import { getAdminDatabase } from '@/lib/firebase/admin';

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const snapshot = await database.collection('specialDates').limit(500).get();
  const exceptions = snapshot.docs
    .map((document) => exceptionFromSnapshot(document.id, document.data()))
    .filter((item) => item !== null)
    .sort(
      (first, second) =>
        first.serviceDate.localeCompare(second.serviceDate) ||
        first.service.localeCompare(second.service),
    );
  return NextResponse.json(
    { exceptions },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PUT(request: Request) {
  const context = await requireAdmin(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const exception = payload ? normalizeSpecialDate(payload) : null;
  if (!exception)
    return NextResponse.json(
      {
        error:
          'Revise a data, o serviço, a capacidade e os horários informados.',
      },
      { status: 400 },
    );

  const reference = database
    .collection('specialDates')
    .doc(specialDateId(exception.serviceDate, exception.service));
  const batch = database.batch();
  batch.set(reference, {
    serviceDate: exception.serviceDate,
    service: exception.service,
    isOpen: exception.isOpen,
    mode: exception.mode,
    bookingPaused: exception.bookingPaused,
    capacityLimit: exception.capacityLimit,
    arrivalTimes: exception.arrivalTimes,
    customerNotice: exception.customerNotice,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.decodedToken.uid,
  });
  batch.set(database.collection('auditLogs').doc(), {
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    actorName: context.user.displayName ?? '',
    action: 'special_date_saved',
    changes: exception,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return NextResponse.json({ exception });
}

export async function DELETE(request: Request) {
  const context = await requireAdmin(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const exception = payload
    ? normalizeSpecialDate({
        ...payload,
        mode: 'open',
        capacityLimit: null,
        arrivalTimes: [],
      })
    : null;
  if (!exception)
    return NextResponse.json(
      { error: 'Data especial inválida.' },
      { status: 400 },
    );

  const id = specialDateId(exception.serviceDate, exception.service);
  const batch = database.batch();
  batch.delete(database.collection('specialDates').doc(id));
  batch.set(database.collection('auditLogs').doc(), {
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    actorName: context.user.displayName ?? '',
    action: 'special_date_removed',
    changes: { serviceDate: exception.serviceDate, service: exception.service },
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
