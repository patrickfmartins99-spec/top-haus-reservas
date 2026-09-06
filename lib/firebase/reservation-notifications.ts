import 'server-only';
import { createHash } from 'node:crypto';
import {
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
}

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
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
