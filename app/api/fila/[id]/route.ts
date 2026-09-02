import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';

const allowedStatuses = ['waiting', 'called', 'seated', 'removed'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const status = typeof payload?.status === 'string' ? payload.status : '';
  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
  }

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const { id } = await params;
  const entryRef = database.collection('waitlist').doc(id);
  const snapshot = await entryRef.get();
  if (!snapshot.exists) return NextResponse.json({ error: 'Cliente não encontrado na fila.' }, { status: 404 });

  const previousStatus = String(snapshot.data()?.status ?? 'waiting');
  const batch = database.batch();
  batch.update(entryRef, {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.decodedToken.uid,
    ...(status === 'called' ? { calledAt: FieldValue.serverTimestamp(), notificationStatus: 'pending_whatsapp_integration' } : {}),
    ...(status === 'seated' ? { seatedAt: FieldValue.serverTimestamp() } : {}),
  });
  batch.set(database.collection('auditLogs').doc(), {
    waitlistId: id,
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    action: 'waitlist_status_changed',
    fromStatus: previousStatus,
    toStatus: status,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
