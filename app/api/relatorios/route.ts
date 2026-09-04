import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin-request';
import { brazilDate } from '@/lib/domain/reservations';
import { buildOperationalReport } from '@/lib/domain/reporting';
import { getAdminDatabase } from '@/lib/firebase/admin';

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

function serializeReservation(
  document: FirebaseFirestore.QueryDocumentSnapshot,
) {
  const data = document.data();
  return {
    id: document.id,
    customerName: String(data.customerName ?? ''),
    whatsapp: String(data.whatsapp ?? ''),
    partySize: Number(data.partySize ?? 0),
    serviceDate: String(data.serviceDate ?? ''),
    status: String(data.status ?? 'confirmed'),
    cancelledAt: serializeTimestamp(data.cancelledAt ?? data.deletedAt),
    cancellationActorType: String(data.cancellationActorType ?? ''),
    cancellationReasonLabel: String(data.cancellationReasonLabel ?? ''),
    cancellationNote: String(data.cancellationNote ?? ''),
    noShowAt: serializeTimestamp(data.noShowAt),
    outcomeReasonLabel: String(data.outcomeReasonLabel ?? ''),
    outcomeNote: String(data.outcomeNote ?? ''),
  };
}

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (!context) {
    return NextResponse.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  }

  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Sistema indisponível.' },
      { status: 503 },
    );

  const requestedDays = Number(
    new URL(request.url).searchParams.get('dias') ?? 30,
  );
  const days = [30, 90, 365].includes(requestedDays) ? requestedDays : 30;
  const endDate = brazilDate();
  const start = new Date(`${endDate}T00:00:00-03:00`);
  start.setDate(start.getDate() - days + 1);
  const startDate = brazilDate(start);
  const startTimestamp = Timestamp.fromDate(start);

  const [
    operationalSnapshot,
    cancelledSnapshot,
    noShowSnapshot,
    waitlistSnapshot,
  ] = await Promise.all([
    database
      .collection('reservations')
      .where('serviceDate', '>=', startDate)
      .where('serviceDate', '<=', endDate)
      .limit(5000)
      .get(),
    database
      .collection('reservations')
      .where('cancelledAt', '>=', startTimestamp)
      .limit(2000)
      .get(),
    database
      .collection('reservations')
      .where('noShowAt', '>=', startTimestamp)
      .limit(2000)
      .get(),
    database
      .collection('waitlist')
      .where('enteredAt', '>=', startTimestamp)
      .limit(5000)
      .get(),
  ]);

  const reservationMap = new Map<
    string,
    ReturnType<typeof serializeReservation>
  >();
  for (const document of [
    ...operationalSnapshot.docs,
    ...cancelledSnapshot.docs,
    ...noShowSnapshot.docs,
  ]) {
    reservationMap.set(document.id, serializeReservation(document));
  }
  const waitlist = waitlistSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      partySize: Number(data.partySize ?? 0),
      status: String(data.status ?? 'waiting'),
      enteredAt: serializeTimestamp(data.enteredAt),
      seatedAt: serializeTimestamp(data.seatedAt),
    };
  });

  return NextResponse.json(
    {
      report: buildOperationalReport(
        [...reservationMap.values()],
        waitlist,
        days,
        endDate,
      ),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
