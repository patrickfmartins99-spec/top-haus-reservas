import { FieldValue } from 'firebase-admin/firestore';
import { after, NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { WAITLIST_CALL_HOLD_MINUTES } from '@/lib/domain/waitlist-time';
import {
  outcomeReason,
  WAITLIST_EXIT_REASONS,
  WAITLIST_NO_SHOW_REASONS,
} from '@/lib/domain/service-outcomes';
import { getAdminDatabase } from '@/lib/firebase/admin';
import {
  enqueueStaffNotification,
  dispatchStaffNotifications,
} from '@/lib/firebase/staff-push';
import { createWhatsAppOutboxEvent } from '@/lib/firebase/whatsapp-outbox';

const allowedStatuses = ['waiting', 'called', 'seated', 'removed', 'no_show'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const status = typeof payload?.status === 'string' ? payload.status : null;
  const hasDetails =
    payload?.customerName !== undefined ||
    payload?.whatsapp !== undefined ||
    payload?.partySize !== undefined;
  if ((!status && !hasDetails) || (status && !allowedStatuses.includes(status)))
    return NextResponse.json({ error: 'Alteração inválida.' }, { status: 400 });

  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const { id } = await params;
  const entryRef = database.collection('waitlist').doc(id);
  const snapshot = await entryRef.get();
  if (!snapshot.exists)
    return NextResponse.json(
      { error: 'Cliente não encontrado na fila.' },
      { status: 404 },
    );

  const previous = snapshot.data() ?? {};
  const previousStatus = String(previous.status ?? 'waiting');
  if (status && status === previousStatus && !hasDetails) {
    return NextResponse.json({ ok: true });
  }

  if (
    status &&
    ['seated', 'removed', 'no_show'].includes(previousStatus) &&
    status !== previousStatus
  ) {
    return NextResponse.json(
      { error: 'Este atendimento já foi encerrado.' },
      { status: 409 },
    );
  }
  let outcome: ReturnType<typeof outcomeReason> | null = null;
  try {
    if (status === 'removed') {
      outcome = outcomeReason(
        payload?.reason,
        WAITLIST_EXIT_REASONS,
        payload?.note,
      );
    } else if (status === 'no_show') {
      outcome = outcomeReason(
        payload?.reason,
        WAITLIST_NO_SHOW_REASONS,
        payload?.note,
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === 'REASON_DETAILS_REQUIRED'
            ? 'Descreva o outro motivo.'
            : 'Selecione o motivo da saída da fila.',
      },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.decodedToken.uid,
  };

  if (hasDetails) {
    const customerName =
      typeof payload?.customerName === 'string'
        ? payload.customerName.trim()
        : '';
    const whatsapp =
      typeof payload?.whatsapp === 'string'
        ? payload.whatsapp.replace(/\D/g, '')
        : '';
    const partySize = Number(payload?.partySize);
    if (
      customerName.length < 2 ||
      whatsapp.length < 10 ||
      !Number.isInteger(partySize) ||
      partySize < 1
    ) {
      return NextResponse.json(
        { error: 'Revise os dados do cliente na fila.' },
        { status: 400 },
      );
    }
    Object.assign(updates, { customerName, whatsapp, partySize });
  }

  if (status)
    Object.assign(updates, {
      status,
      ...(status === 'called'
        ? {
            calledAt: FieldValue.serverTimestamp(),
            notificationStatus: 'pending_whatsapp_integration',
          }
        : {}),
      ...(status === 'seated'
        ? { seatedAt: FieldValue.serverTimestamp() }
        : {}),
      ...(status === 'removed'
        ? {
            removedAt: FieldValue.serverTimestamp(),
            endedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      ...(status === 'no_show'
        ? {
            noShowAt: FieldValue.serverTimestamp(),
            endedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      ...(outcome
        ? {
            exitReason: outcome.reason,
            exitReasonLabel: outcome.reasonLabel,
            exitNote: outcome.note,
          }
        : {}),
    });

  const nextWhatsapp = String(updates.whatsapp ?? previous.whatsapp ?? '');
  const nextCustomerName = String(
    updates.customerName ?? previous.customerName ?? '',
  );
  const nextPartySize = Number(updates.partySize ?? previous.partySize ?? 0);
  const batch = database.batch();
  batch.update(entryRef, updates);
  batch.set(database.collection('auditLogs').doc(), {
    waitlistId: id,
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    action: status ? 'waitlist_status_changed' : 'waitlist_updated',
    fromStatus: previousStatus,
    toStatus: status ?? previousStatus,
    ...(hasDetails || outcome
      ? {
          changes: {
            ...(hasDetails
              ? {
                  before: {
                    customerName: String(previous.customerName ?? ''),
                    whatsapp: String(previous.whatsapp ?? ''),
                    partySize: Number(previous.partySize ?? 0),
                  },
                  after: {
                    customerName: updates.customerName,
                    whatsapp: updates.whatsapp,
                    partySize: updates.partySize,
                  },
                }
              : {}),
            ...(outcome
              ? {
                  reason: outcome.reason,
                  reasonLabel: outcome.reasonLabel,
                  note: outcome.note,
                }
              : {}),
          },
        }
      : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  if (
    ((status && status !== previousStatus) || !status) &&
    status !== 'no_show'
  ) {
    const eventType =
      status === 'called'
        ? 'waitlist_called'
        : status === 'removed'
          ? 'waitlist_removed'
          : status === 'seated'
            ? 'waitlist_seated'
            : 'waitlist_updated';
    const eventRef = database.collection('whatsappQueue').doc();
    enqueueStaffNotification(
      database,
      batch,
      eventRef.id,
      eventType,
      id,
      'waitlist',
    );
    batch.set(
      eventRef,
      createWhatsAppOutboxEvent({
        eventType,
        entityType: 'waitlist',
        entityId: id,
        whatsapp: nextWhatsapp,
        payload: {
          customerName: nextCustomerName,
          partySize: nextPartySize,
          fromStatus: previousStatus,
          toStatus: status ?? previousStatus,
          ...(status === 'called'
            ? { holdMinutes: WAITLIST_CALL_HOLD_MINUTES }
            : {}),
        },
      }),
    );
  }
  await batch.commit();
  after(() => dispatchStaffNotifications(database));

  return NextResponse.json({ ok: true });
}
