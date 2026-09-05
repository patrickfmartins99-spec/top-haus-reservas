import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { brazilDate } from '@/lib/domain/reservations';
import { getOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';

type TaskStatus = 'new' | 'claimed' | 'resolved' | 'dismissed';
type TaskCategory =
  | 'approval'
  | 'table'
  | 'waitlist'
  | 'message'
  | 'arrival'
  | 'notification'
  | 'robot';

type OperationalTask = {
  id: string;
  category: TaskCategory;
  title: string;
  description: string;
  href: string;
  priority: number;
  createdAt: string;
};

function timestamp(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
    return value.toDate().toISOString();
  if (typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
    return value;
  return new Date(0).toISOString();
}

function stateId(taskId: string) {
  return createHash('sha256').update(taskId).digest('hex');
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function reservationDescription(data: Record<string, unknown>) {
  const service = data.service === 'almoco' ? 'almoço' : 'rodízio';
  return `${safeText(data.customerName, 'Cliente')} · ${Number(data.partySize ?? 0)} pessoas · ${service} · ${safeText(data.arrivalTime)}`;
}

function addTask(tasks: Map<string, OperationalTask>, task: OperationalTask) {
  tasks.set(task.id, task);
}

export async function GET(request: Request) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const today = brazilDate();
  const settingsPromise = getOperationalSettings(database);
  const [
    pendingReservations,
    todayReservations,
    calledWaitlist,
    messageSnapshot,
    notifications,
    robotSnapshot,
    settings,
  ] = await Promise.all([
    database
      .collection('reservations')
      .where('status', '==', 'pending_approval')
      .limit(200)
      .get(),
    database
      .collection('reservations')
      .where('serviceDate', '==', today)
      .limit(300)
      .get(),
    database
      .collection('waitlist')
      .where('status', '==', 'called')
      .limit(100)
      .get(),
    database
      .collection('whatsappQueue')
      .where('status', 'in', [
        'failed',
        'pending',
        'manual_pending',
        'processing',
      ])
      .limit(200)
      .get(),
    database
      .collection('staffNotifications')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get(),
    database.collection('robotStatus').doc('reservas-whatsapp').get(),
    settingsPromise,
  ]);

  const tasks = new Map<string, OperationalTask>();
  for (const document of pendingReservations.docs) {
    const data = document.data();
    if (data.deletedAt) continue;
    addTask(tasks, {
      id: `approval:${document.id}`,
      category: 'approval',
      title: 'Reserva aguardando aprovação',
      description: `${reservationDescription(data)} · ${String(data.serviceDate ?? '')}`,
      href: `/painel/reservas?busca=${document.id}`,
      priority: 4,
      createdAt: timestamp(data.createdAt),
    });
  }

  const activeStatuses = new Set([
    'pending_approval',
    'confirmed',
    'presence_confirmed',
  ]);
  const now = Date.now();
  for (const document of todayReservations.docs) {
    const data = document.data();
    if (data.deletedAt || !activeStatuses.has(String(data.status))) continue;
    if (!String(data.tableLabel ?? '').trim()) {
      addTask(tasks, {
        id: `table:${document.id}`,
        category: 'table',
        title: 'Reserva de hoje ainda sem mesa',
        description: reservationDescription(data),
        href: `/painel/reservas?busca=${document.id}`,
        priority: 3,
        createdAt: timestamp(data.createdAt),
      });
    }
    const arrival = new Date(
      `${today}T${String(data.arrivalTime ?? '00:00')}:00-03:00`,
    ).getTime();
    if (
      Number.isFinite(arrival) &&
      now >= arrival - 60 * 60_000 &&
      now <= arrival + settings.lateToleranceMinutes * 60_000 &&
      data.status !== 'seated'
    ) {
      addTask(tasks, {
        id: `arrival:${document.id}`,
        category: 'arrival',
        title: 'Reserva próxima sem chegada confirmada',
        description: reservationDescription(data),
        href: `/painel/reservas?busca=${document.id}`,
        priority: 4,
        createdAt: new Date(arrival).toISOString(),
      });
    }
  }

  for (const document of calledWaitlist.docs) {
    const data = document.data();
    const calledAt = new Date(timestamp(data.calledAt)).getTime();
    if (!calledAt || now - calledAt < 3 * 60_000) continue;
    addTask(tasks, {
      id: `waitlist:${document.id}`,
      category: 'waitlist',
      title: 'Chamada da fila ultrapassou 3 minutos',
      description: `${String(data.customerName ?? 'Cliente')} · ${Number(data.partySize ?? 0)} pessoas · confirme chegada ou registre a saída.`,
      href: '/painel/fila',
      priority: 5,
      createdAt: timestamp(data.calledAt),
    });
  }

  for (const document of messageSnapshot.docs) {
    const data = document.data();
    const createdAt = new Date(timestamp(data.createdAt)).getTime();
    const status = String(data.status ?? '');
    const oldEnough = !createdAt || now - createdAt >= 5 * 60_000;
    if (status !== 'failed' && !oldEnough) continue;
    addTask(tasks, {
      id: `message:${document.id}`,
      category: 'message',
      title:
        status === 'failed'
          ? 'Mensagem do WhatsApp com erro'
          : 'Mensagem do WhatsApp atrasada',
      description: `${String(data.payload?.customerName ?? 'Cliente')} · ${String(data.eventType ?? 'comunicação')} ${data.error ? `· ${String(data.error).slice(0, 140)}` : ''}`,
      href: '/painel/mensagens',
      priority: status === 'failed' ? 5 : 3,
      createdAt: timestamp(data.createdAt),
    });
  }

  const notificationCutoff = now - 48 * 60 * 60_000;
  for (const document of notifications.docs) {
    const data = document.data();
    const createdAt = timestamp(data.createdAt);
    if (new Date(createdAt).getTime() < notificationCutoff) continue;
    const entityId = String(data.entityId ?? '');
    if (
      tasks.has(`message:${document.id}`) ||
      tasks.has(`approval:${entityId}`) ||
      tasks.has(`waitlist:${entityId}`)
    )
      continue;
    addTask(tasks, {
      id: `notification:${document.id}`,
      category: 'notification',
      title: String(data.title ?? 'Atualização no atendimento'),
      description: String(
        data.description ?? 'Abra para conferir os detalhes.',
      ),
      href: String(data.href ?? '/painel'),
      priority: 1,
      createdAt,
    });
  }

  const robotData = robotSnapshot.data() ?? {};
  const pendingMessages = messageSnapshot.docs.filter((document) =>
    ['pending', 'manual_pending', 'processing'].includes(
      String(document.data().status),
    ),
  ).length;
  const failedMessages = messageSnapshot.docs.filter(
    (document) => document.data().status === 'failed',
  ).length;
  const lastHeartbeatAt = timestamp(robotData.lastHeartbeatAt);
  const heartbeatTime = new Date(lastHeartbeatAt).getTime();
  const robotConnected =
    robotSnapshot.exists &&
    robotData.whatsappConnected === true &&
    robotData.firebaseConnected !== false &&
    now - heartbeatTime <= 150_000;
  const robot = {
    monitored: robotSnapshot.exists,
    connected: robotConnected,
    status: String(
      robotData.status ?? (robotSnapshot.exists ? 'unknown' : 'not_configured'),
    ),
    lastHeartbeatAt: robotSnapshot.exists ? lastHeartbeatAt : null,
    lastMessageSentAt: robotData.lastMessageSentAt
      ? timestamp(robotData.lastMessageSentAt)
      : null,
    lastDailyReviewAt: robotData.lastDailyReviewAt
      ? timestamp(robotData.lastDailyReviewAt)
      : null,
    pendingCount: Math.max(
      Number(robotData.pendingCount ?? 0),
      pendingMessages,
    ),
    failedCount: Math.max(Number(robotData.failedCount ?? 0), failedMessages),
    version: String(robotData.version ?? ''),
  };
  if (robot.monitored && !robot.connected) {
    addTask(tasks, {
      id: 'robot:reservas-whatsapp',
      category: 'robot',
      title: 'Robô do WhatsApp precisa de atenção',
      description: heartbeatTime
        ? `Último sinal recebido em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(heartbeatTime))}.`
        : 'O painel ainda não recebeu um sinal válido do robô.',
      href: '/painel/pendencias',
      priority: 5,
      createdAt: lastHeartbeatAt,
    });
  }

  const sourceTasks = [...tasks.values()];
  const stateSnapshots = sourceTasks.length
    ? await database.getAll(
        ...sourceTasks.map((task) =>
          database.collection('operationalTaskStates').doc(stateId(task.id)),
        ),
      )
    : [];
  const states = new Map(
    stateSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [
        String(snapshot.data()?.taskId ?? ''),
        snapshot.data()!,
      ]),
  );
  const includeClosed = new URL(request.url).searchParams.get('todos') === '1';
  const items = sourceTasks
    .map((task) => {
      const state = states.get(task.id);
      return {
        ...task,
        workflowStatus: (state?.status ?? 'new') as TaskStatus,
        workflowActorName: String(state?.actorName ?? ''),
        workflowUpdatedAt: state?.updatedAt ? timestamp(state.updatedAt) : null,
      };
    })
    .filter(
      (task) =>
        includeClosed ||
        !['resolved', 'dismissed'].includes(task.workflowStatus),
    )
    .sort(
      (first, second) =>
        second.priority - first.priority ||
        second.createdAt.localeCompare(first.createdAt),
    );

  return NextResponse.json(
    {
      count: items.length,
      items: items.slice(0, 100),
      robot,
      summary: {
        new: items.filter((item) => item.workflowStatus === 'new').length,
        claimed: items.filter((item) => item.workflowStatus === 'claimed')
          .length,
        critical: items.filter((item) => item.priority >= 4).length,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PATCH(request: Request) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId : '';
  const action = typeof payload?.action === 'string' ? payload.action : '';
  if (
    !/^[a-z_]+:[a-zA-Z0-9_-]{1,160}$/.test(taskId) ||
    !['claim', 'resolve', 'dismiss', 'reopen'].includes(action)
  )
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  const reference = database
    .collection('operationalTaskStates')
    .doc(stateId(taskId));
  const actorName =
    context.user.displayName ?? context.decodedToken.name ?? 'Colaborador';
  try {
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.data() ?? {};
      if (
        action === 'claim' &&
        current.status === 'claimed' &&
        current.actorId !== context.decodedToken.uid
      )
        throw new Error('ALREADY_CLAIMED');
      const status: TaskStatus =
        action === 'claim'
          ? 'claimed'
          : action === 'resolve'
            ? 'resolved'
            : action === 'dismiss'
              ? 'dismissed'
              : 'new';
      transaction.set(
        reference,
        {
          taskId,
          status,
          actorId: context.decodedToken.uid,
          actorName,
          updatedAt: FieldValue.serverTimestamp(),
          ...(status === 'claimed'
            ? { claimedAt: FieldValue.serverTimestamp() }
            : {}),
          ...(status === 'resolved'
            ? { resolvedAt: FieldValue.serverTimestamp() }
            : {}),
        },
        { merge: true },
      );
      transaction.set(database.collection('auditLogs').doc(), {
        actorType: 'staff',
        actorId: context.decodedToken.uid,
        actorName,
        action: `operational_task_${action}`,
        changes: {
          taskId,
          fromStatus: current.status ?? 'new',
          toStatus: status,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_CLAIMED')
      return NextResponse.json(
        { error: 'Outro colaborador já assumiu esta pendência.' },
        { status: 409 },
      );
    throw error;
  }
  return NextResponse.json({ ok: true });
}
