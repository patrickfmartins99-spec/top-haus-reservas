import 'server-only';

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import webpush from 'web-push';

import { getAdminAuthentication } from '@/lib/firebase/admin';
import {
  getPushKeys,
  validSubscription,
} from '@/lib/firebase/reservation-notifications';
import { messageTitles } from '@/lib/whatsapp';

export type StaffNotificationActor = {
  type: 'customer' | 'staff' | 'system';
  name?: string;
};

export type StaffNotificationInput = {
  id: string;
  eventType: string;
  entityId: string;
  entityType?: 'reservation' | 'waitlist';
  payload?: Record<string, unknown>;
  actor?: StaffNotificationActor;
};

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function dateLabel(value: unknown) {
  const text = safeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text.split('-').reverse().join('/')
    : text;
}

function serviceLabel(value: unknown) {
  return value === 'almoco' ? 'almoço' : 'rodízio';
}

function reservationDescription(payload: Record<string, unknown>) {
  const customer = safeText(payload.customerName, 'Cliente');
  const people = Math.max(1, Number(payload.partySize ?? 1));
  const date = dateLabel(payload.serviceDate);
  const time = safeText(payload.arrivalTime);
  const schedule = [date, time ? `às ${time}` : ''].filter(Boolean).join(' ');
  return `${customer} · ${people} pessoa${people === 1 ? '' : 's'} · ${serviceLabel(payload.service)}${schedule ? ` em ${schedule}` : ''}.`;
}

function waitlistDescription(payload: Record<string, unknown>) {
  const customer = safeText(payload.customerName, 'Cliente');
  const people = Math.max(1, Number(payload.partySize ?? 1));
  return `${customer} · ${people} pessoa${people === 1 ? '' : 's'}.`;
}

export function staffNotificationContent(input: StaffNotificationInput) {
  const payload = input.payload ?? {};
  const actorType = input.actor?.type ?? 'system';
  const actorName = safeText(input.actor?.name, 'um colaborador');
  const customer = safeText(payload.customerName, 'Cliente');
  const details =
    input.entityType === 'waitlist'
      ? waitlistDescription(payload)
      : reservationDescription(payload);
  const needsApproval =
    safeText(payload.toStatus ?? payload.status) === 'pending_approval';

  switch (input.eventType) {
    case 'reservation_confirmed':
      return actorType === 'staff'
        ? { title: `Reserva adicionada por ${actorName}`, description: details }
        : { title: 'Nova reserva pelo site', description: details };
    case 'reservation_pending_approval':
      return actorType === 'staff'
        ? {
            title: `Reserva adicionada por ${actorName}`,
            description: `${details} Precisa de aprovação.`,
          }
        : {
            title: 'Nova reserva precisa de aprovação',
            description: details,
          };
    case 'reservation_approved':
      return {
        title: `Reserva aprovada por ${actorName}`,
        description: details,
      };
    case 'reservation_updated':
      if (actorType === 'customer') {
        return {
          title: needsApproval
            ? 'Reserva alterada e precisa de aprovação'
            : 'Reserva alterada pelo cliente',
          description: `${customer} alterou informações da reserva. ${details}`,
        };
      }
      return {
        title: `Reserva alterada por ${actorName}`,
        description: details,
      };
    case 'reservation_cancelled':
      return {
        title:
          actorType === 'customer'
            ? 'Reserva cancelada pelo cliente'
            : `Reserva cancelada por ${actorName}`,
        description: details,
      };
    case 'reservation_presence_confirmed':
      return { title: 'Cliente confirmou presença', description: details };
    case 'reservation_seated':
      return {
        title: `Chegada confirmada por ${actorName}`,
        description: details,
      };
    case 'reservation_no_show':
      return {
        title: `No show registrado por ${actorName}`,
        description: details,
      };
    case 'reservation_completed':
      return {
        title: `Atendimento concluído por ${actorName}`,
        description: details,
      };
    case 'waitlist_created':
      return {
        title: `Cliente adicionado à fila por ${actorName}`,
        description: details,
      };
    case 'waitlist_updated':
      return {
        title: `Fila alterada por ${actorName}`,
        description: details,
      };
    case 'waitlist_called':
      return {
        title: `Cliente chamado por ${actorName}`,
        description: details,
      };
    case 'waitlist_seated':
      return {
        title: `Chegada da fila confirmada por ${actorName}`,
        description: details,
      };
    case 'waitlist_removed':
      return {
        title: `Cliente retirado da fila por ${actorName}`,
        description: details,
      };
    case 'waitlist_no_show':
      return {
        title: `No show da fila registrado por ${actorName}`,
        description: details,
      };
    default:
      return {
        title: messageTitles[input.eventType] ?? 'Atualização no atendimento',
        description: details,
      };
  }
}

export function enqueueStaffNotification(
  db: Firestore,
  writer: {
    set(ref: DocumentReference, data: DocumentData): unknown;
  },
  input: StaffNotificationInput,
) {
  const content = staffNotificationContent(input);
  writer.set(db.collection('staffNotifications').doc(input.id), {
    ...content,
    eventType: input.eventType,
    entityId: input.entityId,
    entityType: input.entityType ?? 'reservation',
    actorType: input.actor?.type ?? 'system',
    actorName: safeText(input.actor?.name),
    href:
      input.entityType === 'waitlist'
        ? '/painel/fila'
        : `/painel/reservas?busca=${input.entityId}`,
    createdAt: FieldValue.serverTimestamp(),
    pushStatus: 'pending',
  });
}

export async function sendStaffPush(
  db: Firestore,
  subscription: webpush.PushSubscription,
  event: { id: string; title: string; description?: string; href: string },
) {
  const keys = await getPushKeys(db);
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: event.title,
      body:
        event.description ??
        'Há uma atualização no painel do Top Haus. Abra para conferir.',
      tag: event.id,
      url: event.href,
    }),
    {
      TTL: 1800,
      timeout: 5000,
      vapidDetails: {
        ...keys,
        subject: 'https://reservastophaus.netlify.app',
      },
    },
  );
}

export async function dispatchStaffNotifications(db: Firestore) {
  try {
    const authentication = getAdminAuthentication();
    if (!authentication) return;
    const [events, subscriptions] = await Promise.all([
      db
        .collection('staffNotifications')
        .where('pushStatus', '==', 'pending')
        .limit(20)
        .get(),
      db.collection('staffPushSubscriptions').limit(100).get(),
    ]);
    const active = new Map<string, boolean>();
    for (const uid of new Set(
      subscriptions.docs.map((subscription) =>
        String(subscription.data().uid ?? ''),
      ),
    )) {
      try {
        const user = await authentication.getUser(uid);
        active.set(uid, !user.disabled && user.customClaims?.staff === true);
      } catch {
        active.set(uid, false);
      }
    }
    const devices = subscriptions.docs.filter(
      (subscription) =>
        active.get(String(subscription.data().uid ?? '')) &&
        subscription.data().expiresAt > Date.now() &&
        validSubscription(subscription.data().subscription),
    );

    await Promise.all(
      events.docs.map(async (event) => {
        const claimed = await db.runTransaction(async (transaction) => {
          const fresh = await transaction.get(event.ref);
          if (fresh.data()?.pushStatus !== 'pending') return false;
          transaction.update(event.ref, { pushStatus: 'processing' });
          return true;
        });
        if (!claimed) return;
        if (
          Date.now() - (event.data().createdAt?.toMillis() ?? 0) >
          30 * 60_000
        ) {
          await event.ref.update({ pushStatus: 'expired' });
          return;
        }

        const results = await Promise.all(
          devices.map(async (subscription) => {
            try {
              await sendStaffPush(db, subscription.data().subscription, {
                id: event.id,
                title: event.data().title,
                description: event.data().description,
                href: event.data().href,
              });
              return true;
            } catch (error) {
              if (
                [404, 410].includes(
                  Number((error as { statusCode?: number }).statusCode),
                )
              ) {
                await subscription.ref.delete();
              }
              return false;
            }
          }),
        );
        const delivered = results.filter(Boolean).length;
        await event.ref.update({
          pushStatus: !results.length
            ? 'no_devices'
            : delivered === results.length
              ? 'sent'
              : delivered
                ? 'partial'
                : 'failed',
          deliverySummary: {
            attempted: results.length,
            delivered,
            failed: results.length - delivered,
          },
          pushAttemptedAt: FieldValue.serverTimestamp(),
        });
      }),
    );
  } catch {
    console.error('Push da equipe indisponível; confira o sino do painel.');
  }
}
