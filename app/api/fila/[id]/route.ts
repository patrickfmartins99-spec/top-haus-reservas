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
  if (
    (!status && !hasDetails) ||
    (status && hasDetails) ||
    (status && !allowedStatuses.includes(status)) ||
    (payload?.expectedRevision !== undefined &&
      (!Number.isInteger(payload.expectedRevision) ||
        Number(payload.expectedRevision) < 0))
  )
    return NextResponse.json({ error: 'Alteração inválida.' }, { status: 400 });

  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id))
    return NextResponse.json(
      { error: 'Cliente da fila inválido.' },
      { status: 400 },
    );
  const entryRef = database.collection('waitlist').doc(id);
  try {
    const result = await database.runTransaction(async (batch) => {
      const snapshot = await batch.get(entryRef);
      if (!snapshot.exists)
        return { error: 'Cliente não encontrado na fila.', status: 404 };

      const previous = snapshot.data() ?? {};
      const previousStatus = String(previous.status ?? 'waiting');
      if (status && status === previousStatus && !hasDetails) {
        return { changed: false };
      }

      if (['seated', 'removed', 'no_show'].includes(previousStatus)) {
        return {
          error: 'Este atendimento já foi encerrado. Atualize a fila.',
          status: 409,
        };
      }
      if (
        payload?.expectedRevision !== undefined &&
        payload.expectedRevision !== Number(previous.revision ?? 0)
      )
        return {
          error:
            'Outro colaborador alterou este atendimento. Feche e reabra a edição para conferir os dados atuais.',
          status: 409,
        };
      const transitions: Record<string, string[]> = {
        waiting: ['called', 'removed'],
        called: ['seated', 'removed', 'no_show'],
      };
      if (status && !transitions[previousStatus]?.includes(status))
        return {
          error: 'A situação da fila mudou. Atualize antes de continuar.',
          status: 409,
        };
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
        return {
          error:
            error instanceof Error &&
            error.message === 'REASON_DETAILS_REQUIRED'
              ? 'Descreva o outro motivo.'
              : 'Selecione o motivo da saída da fila.',
          status: 400,
        };
      }
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.decodedToken.uid,
        revision: Number(previous.revision ?? 0) + 1,
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
          return { error: 'Revise os dados do cliente na fila.', status: 400 };
        }
        Object.assign(updates, { customerName, whatsapp, partySize });
        if (
          customerName === previous.customerName &&
          whatsapp === previous.whatsapp &&
          partySize === previous.partySize
        )
          return { changed: false };
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
            ? {
                seatedAt: FieldValue.serverTimestamp(),
                endedAt: FieldValue.serverTimestamp(),
              }
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
      const nextPartySize = Number(
        updates.partySize ?? previous.partySize ?? 0,
      );
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
      if ((status && status !== previousStatus) || !status) {
        const eventType =
          status === 'called'
            ? 'waitlist_called'
            : status === 'removed'
              ? 'waitlist_removed'
              : status === 'no_show'
                ? 'waitlist_no_show'
                : status === 'seated'
                  ? 'waitlist_seated'
                  : 'waitlist_updated';
        const eventRef = database.collection('whatsappQueue').doc();
        enqueueStaffNotification(database, batch, {
          id: eventRef.id,
          eventType,
          entityId: id,
          entityType: 'waitlist',
          payload: {
            customerName: nextCustomerName,
            partySize: nextPartySize,
          },
          actor: {
            type: 'staff',
            name: context.user?.displayName ?? context.decodedToken.name,
          },
        });
        if (status !== 'no_show') {
          batch.set(
            eventRef,
            createWhatsAppOutboxEvent({
              eventType:
                eventType === 'waitlist_no_show'
                  ? 'waitlist_removed'
                  : eventType,
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
      }
      return { changed: true };
    });
    if ('error' in result)
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    if (result.changed) after(() => dispatchStaffNotifications(database));
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch {
    return NextResponse.json(
      {
        error:
          'Não foi possível concluir a alteração. Confira a situação atual antes de tentar novamente.',
      },
      { status: 503 },
    );
  }
}
