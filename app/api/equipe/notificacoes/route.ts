import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { getPushKeys, hash, validSubscription } from '@/lib/firebase/reservation-notifications';
import { sendStaffPush } from '@/lib/firebase/staff-push';

export async function POST(request: Request) {
  const staff = await requireStaff(request);
  if (!staff) return NextResponse.json({ error: 'Entre com seu acesso de colaborador.' }, { status: 403 });
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const payload = await request.json().catch(() => null);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (payload?.action === 'config') return NextResponse.json({ publicKey: (await getPushKeys(db)).publicKey }, { headers });
  if (!['subscribe', 'unsubscribe', 'test'].includes(payload?.action) || !validSubscription(payload?.subscription)) return NextResponse.json({ error: 'Inscrição ou ação inválida.' }, { status: 400 });
  const { endpoint, keys } = payload.subscription;
  const ref = db.collection('staffPushSubscriptions').doc(hash(endpoint));
  const uid = staff.decodedToken.uid;
  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && existing.data()?.uid !== uid) throw new Error('OWNER');
      if (payload.action === 'unsubscribe') { if (existing.exists) tx.delete(ref); return; }
      if (payload.action === 'test') {
        if (!existing.exists || existing.data()?.expiresAt < Date.now()) throw new Error('SUBSCRIBE');
        if (Date.now() - Number(existing.data()?.lastTestAt ?? 0) < 30_000) throw new Error('RATE');
        tx.update(ref, { lastTestAt: Date.now() }); return;
      }
      tx.set(ref, { uid, subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, expiresAt: Date.now() + 30 * 86_400_000 }, { merge: true });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'RATE') return NextResponse.json({ error: 'Aguarde 30 segundos antes de testar novamente.' }, { status: 429 });
    if (message === 'OWNER' || message === 'SUBSCRIBE') return NextResponse.json({ error: 'Ative novamente as notificações neste aparelho com seu usuário.' }, { status: 409 });
    throw error;
  }
  if (payload.action === 'test') {
    try { await sendStaffPush(db, payload.subscription, { id: `test-${Date.now()}`, title: 'Teste — Top Haus Reservas', href: '/painel' }); }
    catch { return NextResponse.json({ error: 'O serviço de notificações não aceitou o teste. Desative e ative novamente neste aparelho.' }, { status: 502 }); }
    return NextResponse.json({ ok: true, message: 'Teste aceito pelo serviço de notificações. Confira se o aviso apareceu no celular.' }, { headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
