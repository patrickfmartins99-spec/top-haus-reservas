import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';

const allowedStatuses = ['waiting', 'called', 'seated', 'removed'];
const preferences = ['sem_preferencia', 'sofa', 'parede_vidro', 'parede_tomada'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const status = typeof payload?.status === 'string' ? payload.status : null;
  const hasDetails = payload?.customerName !== undefined || payload?.whatsapp !== undefined || payload?.partySize !== undefined || payload?.estimatedMinutes !== undefined || payload?.seatingPreference !== undefined;
  if ((!status && !hasDetails) || (status && !allowedStatuses.includes(status))) return NextResponse.json({ error: 'Alteração inválida.' }, { status: 400 });

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const { id } = await params;
  const entryRef = database.collection('waitlist').doc(id);
  const snapshot = await entryRef.get();
  if (!snapshot.exists) return NextResponse.json({ error: 'Cliente não encontrado na fila.' }, { status: 404 });

  const previous = snapshot.data() ?? {};
  const previousStatus = String(previous.status ?? 'waiting');
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.decodedToken.uid,
  };

  if (hasDetails) {
    const customerName = typeof payload?.customerName === 'string' ? payload.customerName.trim() : '';
    const whatsapp = typeof payload?.whatsapp === 'string' ? payload.whatsapp.replace(/\D/g, '') : '';
    const partySize = Number(payload?.partySize);
    const estimatedMinutes = Number(payload?.estimatedMinutes);
    const seatingPreference = typeof payload?.seatingPreference === 'string' ? payload.seatingPreference : '';
    if (customerName.length < 2 || whatsapp.length < 10 || !Number.isInteger(partySize) || partySize < 1 || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || !preferences.includes(seatingPreference)) {
      return NextResponse.json({ error: 'Revise os dados do cliente na fila.' }, { status: 400 });
    }
    Object.assign(updates, { customerName, whatsapp, partySize, estimatedMinutes, seatingPreference });
  }

  if (status) Object.assign(updates, {
    status,
    ...(status === 'called' ? { calledAt: FieldValue.serverTimestamp(), notificationStatus: 'pending_whatsapp_integration' } : {}),
    ...(status === 'seated' ? { seatedAt: FieldValue.serverTimestamp() } : {}),
  });

  const batch = database.batch();
  batch.update(entryRef, updates);
  batch.set(database.collection('auditLogs').doc(), {
    waitlistId: id,
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    action: status ? 'waitlist_status_changed' : 'waitlist_updated',
    fromStatus: previousStatus,
    toStatus: status ?? previousStatus,
    ...(hasDetails ? {
      changes: {
        before: {
          customerName: String(previous.customerName ?? ''),
          whatsapp: String(previous.whatsapp ?? ''),
          partySize: Number(previous.partySize ?? 0),
          estimatedMinutes: Number(previous.estimatedMinutes ?? 0),
          seatingPreference: String(previous.seatingPreference ?? ''),
        },
        after: {
          customerName: updates.customerName,
          whatsapp: updates.whatsapp,
          partySize: updates.partySize,
          estimatedMinutes: updates.estimatedMinutes,
          seatingPreference: updates.seatingPreference,
        },
      },
    } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
