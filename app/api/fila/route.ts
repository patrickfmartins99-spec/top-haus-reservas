import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { createWhatsAppOutboxEvent } from '@/lib/firebase/whatsapp-outbox';

function serializeTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const snapshot = await database.collection('waitlist').orderBy('enteredAt', 'asc').limit(200).get();
  const entries = snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      customerName: String(data.customerName ?? ''),
      whatsapp: String(data.whatsapp ?? ''),
      partySize: Number(data.partySize ?? 0),
      status: String(data.status ?? 'waiting'),
      enteredAt: serializeTimestamp(data.enteredAt),
      calledAt: serializeTimestamp(data.calledAt),
      seatedAt: serializeTimestamp(data.seatedAt),
      removedAt: serializeTimestamp(data.removedAt),
    };
  });

  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerName = typeof payload?.customerName === 'string' ? payload.customerName.trim() : '';
  const whatsapp = typeof payload?.whatsapp === 'string' ? payload.whatsapp.replace(/\D/g, '') : '';
  const partySize = Number(payload?.partySize);

  if (customerName.length < 2 || whatsapp.length < 10 || !Number.isInteger(partySize) || partySize < 1) {
    return NextResponse.json({ error: 'Preencha nome, WhatsApp e quantidade de pessoas.' }, { status: 400 });
  }

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const entryRef = database.collection('waitlist').doc();
  const whatsappEventRef = database.collection('whatsappQueue').doc();
  const batch = database.batch();
  batch.set(entryRef, {
    customerName,
    whatsapp,
    partySize,
    status: 'waiting',
    notificationStatus: 'pending_whatsapp_integration',
    enteredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: context.decodedToken.uid,
  });
  batch.set(database.collection('auditLogs').doc(), {
    waitlistId: entryRef.id,
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    action: 'waitlist_created',
    changes: { customerName, partySize },
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(whatsappEventRef, createWhatsAppOutboxEvent({
    eventType: 'waitlist_created',
    entityType: 'waitlist',
    entityId: entryRef.id,
    whatsapp,
    payload: { customerName, partySize },
  }));
  await batch.commit();

  return NextResponse.json({ id: entryRef.id }, { status: 201 });
}
