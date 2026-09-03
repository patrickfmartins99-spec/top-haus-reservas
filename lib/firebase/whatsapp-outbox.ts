import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

export type WhatsAppEventType =
  | 'reservation_confirmed'
  | 'reservation_pending_approval'
  | 'reservation_approved'
  | 'reservation_updated'
  | 'reservation_cancelled'
  | 'reservation_presence_confirmed'
  | 'reservation_no_show'
  | 'waitlist_created'
  | 'waitlist_updated'
  | 'waitlist_called'
  | 'waitlist_seated'
  | 'waitlist_removed';

type WhatsAppOutboxInput = {
  eventType: WhatsAppEventType;
  entityType: 'reservation' | 'waitlist';
  entityId: string;
  whatsapp: string;
  payload: Record<string, unknown>;
};

export function createWhatsAppOutboxEvent(input: WhatsAppOutboxInput) {
  return {
    schemaVersion: 1,
    channel: 'whatsapp',
    source: 'top_haus_reservas',
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    recipientWhatsapp: input.whatsapp.replace(/\D/g, ''),
    payload: input.payload,
    status: 'pending',
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}
