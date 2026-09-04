import 'server-only';
import { FieldValue, type Firestore, type DocumentReference, type DocumentData } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { getAdminAuthentication } from '@/lib/firebase/admin';
import { getPushKeys, validSubscription } from '@/lib/firebase/reservation-notifications';
import { messageTitles } from '@/lib/whatsapp';

export function enqueueStaffNotification(db: Firestore, writer: { set(ref: DocumentReference, data: DocumentData): unknown }, id: string, eventType: string, entityId: string, entityType = 'reservation') {
  writer.set(db.collection('staffNotifications').doc(id), { title: messageTitles[eventType] ?? 'Atualização no atendimento', eventType, entityId, href: entityType === 'waitlist' ? '/painel/fila' : `/painel/reservas?busca=${entityId}`, createdAt: FieldValue.serverTimestamp(), pushStatus: 'pending' });
}

export async function sendStaffPush(db: Firestore, subscription: webpush.PushSubscription, event: { id: string; title: string; href: string }) {
  const keys = await getPushKeys(db);
  await webpush.sendNotification(subscription, JSON.stringify({ title: event.title, body: 'Há uma atualização no painel do Top Haus. Abra para conferir.', tag: event.id, url: event.href }), { TTL: 1800, timeout: 5000, vapidDetails: { ...keys, subject: 'https://reservastophaus.netlify.app' } });
}

export async function dispatchStaffNotifications(db: Firestore) {
  try {
    const authentication = getAdminAuthentication();
    if (!authentication) return;
    const [events, subscriptions] = await Promise.all([db.collection('staffNotifications').where('pushStatus', '==', 'pending').limit(20).get(), db.collection('staffPushSubscriptions').limit(100).get()]);
    const active = new Map<string, boolean>();
    for (const uid of new Set(subscriptions.docs.map((sub) => String(sub.data().uid ?? '')))) {
      try { const user = await authentication.getUser(uid); active.set(uid, !user.disabled && user.customClaims?.staff === true); }
      catch { active.set(uid, false); }
    }
    const devices = subscriptions.docs.filter((sub) => active.get(sub.data().uid) && sub.data().expiresAt > Date.now() && validSubscription(sub.data().subscription));
    await Promise.all(events.docs.map(async (event) => {
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(event.ref);
        if (fresh.data()?.pushStatus !== 'pending') return false;
        tx.update(event.ref, { pushStatus: 'processing' }); return true;
      });
      if (!claimed) return;
      // Do not deliver old pending messages as new alerts after downtime.
      if (Date.now() - (event.data().createdAt?.toMillis() ?? 0) > 30 * 60_000) { await event.ref.update({ pushStatus: 'expired' }); return; }
      const results = await Promise.all(devices.map(async (sub) => {
        try { await sendStaffPush(db, sub.data().subscription, { id: event.id, title: event.data().title, href: event.data().href }); return true; }
        catch (error) { if ([404, 410].includes(Number((error as { statusCode?: number }).statusCode))) await sub.ref.delete(); return false; }
      }));
      await event.ref.update({ pushStatus: !results.length ? 'no_devices' : results.every(Boolean) ? 'sent' : 'failed', pushAttemptedAt: FieldValue.serverTimestamp() });
    }));
  } catch { console.error('Push da equipe indisponível; confira o sino do painel.'); }
}
