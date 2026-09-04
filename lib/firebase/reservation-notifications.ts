import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import {
  FieldValue,
  type Firestore,
  type DocumentReference,
  type DocumentData,
} from 'firebase-admin/firestore';
import webpush from 'web-push';
import {
  createWhatsAppOutboxEvent,
  type WhatsAppOutboxInput,
} from './whatsapp-outbox';
import {
  enqueueStaffNotification,
  dispatchStaffNotifications,
} from '@/lib/firebase/staff-push';
import { customerMessage, messageTitles } from '@/lib/whatsapp';

export function enqueueReservationEvent(
  db: Firestore,
  writer: { set(ref: DocumentReference, data: DocumentData): unknown },
  input: WhatsAppOutboxInput,
) {
  const event = db.collection('whatsappQueue').doc();
  writer.set(event, createWhatsAppOutboxEvent(input));
  enqueueStaffNotification(db, writer, {
    id: event.id,
    eventType: input.eventType,
    entityId: input.entityId,
    entityType: input.entityType,
    payload: input.payload,
    actor: input.staffNotification
      ? {
          type: input.staffNotification.actorType,
          name: input.staffNotification.actorName,
        }
      : undefined,
  });
  writer.set(
    db
      .collection('reservations')
      .doc(input.entityId)
      .collection('notifications')
      .doc(event.id),
    {
      title: messageTitles[input.eventType] ?? 'Atualização da reserva',
      body: customerMessage(input.eventType, input.payload),
      eventType: input.eventType,
      createdAt: FieldValue.serverTimestamp(),
      channel: 'in_app',
    },
  );
}

export async function issueNotificationAccess(
  db: Firestore,
  reservationId: string,
) {
  const token = randomBytes(32).toString('hex');
  await db
    .collection('customerNotificationAccess')
    .doc(hash(token))
    .set({ reservationId, expiresAt: Date.now() + 400 * 86_400_000 });
  return token;
}

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function verifiedAccess(db: Firestore, value: unknown) {
  if (!Array.isArray(value) || value.length > 20) return [];
  const ids = await Promise.all(
    value.map(async (item: { id?: unknown; token?: unknown }) => {
      if (
        !item ||
        typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) ||
        typeof item.token !== 'string' ||
        !/^[a-f0-9]{48,64}$/.test(item.token)
      )
        return null;
      const [reservation, access] = await Promise.all([
        db.collection('reservations').doc(item.id).get(),
        db.collection('customerNotificationAccess').doc(hash(item.token)).get(),
      ]);
      if (!reservation.exists) return null;
      const data = reservation.data()!;
      const date = new Date(`${data.serviceDate}T23:59:59-03:00`).getTime();
      if (!Number.isFinite(date) || Date.now() > date + 30 * 86_400_000)
        return null;
      return data.confirmationTokenHash === hash(item.token) ||
        (access.data()?.reservationId === item.id &&
          access.data()!.expiresAt > Date.now())
        ? item.id
        : null;
    }),
  );
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

// Persistent, server-only keys. Never expose the private key in an API or client bundle.
export async function getPushKeys(db: Firestore) {
  const ref = db.collection('systemSecrets').doc('webPush');
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists)
      return snapshot.data() as { publicKey: string; privateKey: string };
    const keys = webpush.generateVAPIDKeys();
    tx.set(ref, keys);
    return keys;
  });
}

export function validSubscription(
  value: unknown,
): value is webpush.PushSubscription {
  if (!value || typeof value !== 'object') return false;
  const sub = value as webpush.PushSubscription;
  try {
    const url = new URL(sub.endpoint);
    // Do not permit an arbitrary outbound request (SSRF) through subscriptions.
    const trusted =
      url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(url.hostname) ||
      url.hostname === 'web.push.apple.com';
    return (
      trusted &&
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      sub.endpoint.length < 2048 &&
      /^[\w-]{87}$/.test(sub.keys?.p256dh) &&
      /^[\w-]{22}$/.test(sub.keys?.auth)
    );
  } catch {
    return false;
  }
}

export async function dispatchReservationPush(db: Firestore, _id: string) {
  await dispatchStaffNotifications(db);
}
