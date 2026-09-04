import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { customerMessage, messageTitles, normalizeWhatsApp } from '@/lib/whatsapp';

export async function GET(request: Request) {
  if (!await requireStaff(request)) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const snapshot = await db.collection('whatsappQueue').where('status', '==', 'manual_pending').limit(100).get();
  const items = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const current = await db.collection(data.entityType === 'waitlist' ? 'waitlist' : 'reservations').doc(data.entityId).get();
    const latest = current.data();
    let warning = '';
    if (!latest) warning = 'O registro não existe mais. Descarte esta mensagem.';
    else if (normalizeWhatsApp(String(latest.whatsapp ?? '')) !== normalizeWhatsApp(String(data.recipientWhatsapp ?? ''))) warning = 'O contato foi alterado. Não envie esta mensagem ao número anterior.';
    else if (data.entityType === 'waitlist') {
      if (['removed', 'seated'].includes(latest.status) && !['waitlist_removed', 'waitlist_seated'].includes(data.eventType)) warning = 'O cliente já saiu da espera. Descarte esta mensagem antiga.';
      else if (data.eventType === 'waitlist_called' && (latest.status !== 'called' || Date.now() - (latest.calledAt?.toMillis() ?? 0) > 180_000)) warning = 'A chamada de três minutos expirou. Confira a mesa antes de fazer uma nova chamada.';
      else if (data.eventType === 'waitlist_created' && latest.status !== 'waiting') warning = 'A situação da fila mudou. Use a mensagem mais recente.';
      else if (data.eventType === 'waitlist_updated' && latest.status !== 'waiting') warning = 'A situação da fila mudou. Confira a atualização mais recente.';
    } else if (data.eventType !== 'reservation_cancelled' && (latest.deletedAt || latest.status === 'cancelled')) warning = 'Esta reserva foi cancelada ou excluída. Não envie esta mensagem anterior.';
    if (!warning && latest && data.entityType === 'reservation') {
      const expected: Record<string, string[]> = { reservation_pending_approval: ['pending_approval'], reservation_confirmed: ['confirmed', 'presence_confirmed'], reservation_approved: ['confirmed', 'presence_confirmed'], reservation_cancelled: ['cancelled'], reservation_no_show: ['no_show'], reservation_presence_confirmed: ['presence_confirmed'], reservation_seated: ['seated'], reservation_completed: ['completed'] };
      if ((expected[data.eventType] && !expected[data.eventType].includes(latest.status)) || (data.eventType === 'reservation_updated' && data.payload?.toStatus !== latest.status)) warning = 'A situação da reserva mudou. Use a mensagem mais recente.';
    }
    if (!warning && data.entityType === 'reservation' && data.eventType !== 'reservation_cancelled' && new Date(`${data.payload?.serviceDate}T23:59:59-03:00`).getTime() < Date.now()) warning = 'A data desta reserva já passou. Confira o histórico antes de entrar em contato.';
    if (!warning && latest && data.entityType === 'reservation' && data.eventType !== 'reservation_cancelled' && ['serviceDate', 'arrivalTime', 'partySize', 'customerName'].some((key) => data.payload?.[key] !== undefined && String(data.payload[key]) !== String(latest[key]))) warning = 'Os dados mudaram depois desta mensagem. Use a atualização mais recente.';
    return { id: doc.id, title: messageTitles[data.eventType] ?? 'Atualização', customerName: data.payload?.customerName ?? '', whatsapp: data.recipientWhatsapp, message: customerMessage(data.eventType, data.payload ?? {}), createdAt: data.createdAt?.toDate().toISOString() ?? '', warning };
  }));
  return NextResponse.json({ items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const staff = await requireStaff(request);
  if (!staff) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });
  const data = await request.json().catch(() => null);
  if (!data || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id) || !['manual_sent', 'ignored'].includes(data.status)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const ref = db.collection('whatsappQueue').doc(data.id);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.status !== 'manual_pending') return;
    tx.update(ref, { status: data.status, handledBy: staff.decodedToken.uid, handledAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('auditLogs').doc(), { actorType: 'staff', actorId: staff.decodedToken.uid, action: data.status === 'manual_sent' ? 'whatsapp_manual_sent' : 'whatsapp_discarded', messageId: data.id, createdAt: FieldValue.serverTimestamp() });
  });
  return NextResponse.json({ ok: true });
}
