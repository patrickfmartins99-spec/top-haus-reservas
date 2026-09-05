'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  BellRing,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MessageCircleWarning,
  RefreshCw,
  UserRoundCheck,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getFirebaseClient } from '@/lib/firebase/client';

type WorkflowStatus = 'new' | 'claimed' | 'resolved' | 'dismissed';
type Task = {
  id: string;
  category:
    | 'approval'
    | 'table'
    | 'waitlist'
    | 'message'
    | 'arrival'
    | 'notification'
    | 'robot';
  title: string;
  description: string;
  href: string;
  priority: number;
  createdAt: string;
  workflowStatus: WorkflowStatus;
  workflowActorName: string;
  workflowUpdatedAt: string | null;
};
type RobotStatus = {
  monitored: boolean;
  connected: boolean;
  status: string;
  lastHeartbeatAt: string | null;
  lastMessageSentAt: string | null;
  lastDailyReviewAt: string | null;
  pendingCount: number;
  failedCount: number;
  version: string;
};

const categoryLabels: Record<Task['category'], string> = {
  approval: 'Aprovação',
  table: 'Mesa',
  waitlist: 'Fila',
  message: 'WhatsApp',
  arrival: 'Chegada',
  notification: 'Notificação',
  robot: 'Robô',
};

function dateTime(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime()))
    return 'Ainda não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export default function PendingTasksPage() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Task[]>([]);
  const [robot, setRobot] = useState<RobotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Task['category']>('all');

  const load = useCallback(async (current: User, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch('/api/pendencias', {
        headers: { Authorization: `Bearer ${await current.getIdToken()}` },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ?? 'Não foi possível carregar as pendências.',
        );
      setItems(data.items ?? []);
      setRobot(data.robot ?? null);
      setError('');
    } catch (caught) {
      if (!quiet)
        setError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível carregar as pendências.',
        );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => {
        setError('Firebase não configurado.');
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, (current) => {
      if (!current) return;
      setUser(current);
      void load(current);
    });
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => void load(user, true), 60_000);
    const refresh = () => void load(user, true);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load, user]);

  async function changeState(
    task: Task,
    action: 'claim' | 'resolve' | 'dismiss',
  ) {
    if (!user) return;
    setBusyId(task.id);
    setError('');
    try {
      const response = await fetch('/api/pendencias', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ taskId: task.id, action }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ?? 'Não foi possível atualizar a pendência.',
        );
      if (action === 'claim') {
        await load(user, true);
      } else {
        setItems((current) => current.filter((item) => item.id !== task.id));
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível atualizar a pendência.',
      );
    } finally {
      setBusyId('');
    }
  }

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))],
    [items],
  );
  const visible =
    filter === 'all' ? items : items.filter((item) => item.category === filter);
  const criticalCount = items.filter((item) => item.priority >= 4).length;
  const claimedCount = items.filter(
    (item) => item.workflowStatus === 'claimed',
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-haus-terracotta">
            Operação do dia
          </p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">
            Central de pendências
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-6 text-black/65">
            Veja o que precisa de atenção, assuma um atendimento e deixe claro
            para toda a equipe quando ele estiver resolvido.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!user || refreshing}
          onClick={() => user && void load(user)}
          className="bg-white"
        >
          <RefreshCw className={refreshing ? 'animate-spin' : ''} /> Atualizar
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border border-red-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <CardContent className="flex items-center gap-4 py-5">
            <span className="grid size-11 place-items-center rounded-xl bg-red-100 text-red-700">
              <CircleAlert />
            </span>
            <div>
              <p className="text-sm font-semibold text-black/60">
                Alta prioridade
              </p>
              <p className="text-3xl font-extrabold">
                {loading ? '—' : criticalCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-amber-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <CardContent className="flex items-center gap-4 py-5">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <UserRoundCheck />
            </span>
            <div>
              <p className="text-sm font-semibold text-black/60">
                Em atendimento
              </p>
              <p className="text-3xl font-extrabold">
                {loading ? '—' : claimedCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-black/12 bg-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
          <CardContent className="flex items-center gap-4 py-5">
            <span className="grid size-11 place-items-center rounded-xl bg-white/12 text-white">
              <BellRing />
            </span>
            <div>
              <p className="text-sm font-semibold text-white/70">
                Total em aberto
              </p>
              <p className="text-3xl font-extrabold">
                {loading ? '—' : items.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card
        className={`border bg-white shadow-[0_12px_34px_rgba(0,0,0,0.09)] ${robot?.connected ? 'border-emerald-200' : robot?.monitored ? 'border-red-200' : 'border-amber-200'}`}
      >
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-black/8">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-10 place-items-center rounded-xl ${robot?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
            >
              <Bot />
            </span>
            <div>
              <CardTitle className="text-lg">Robô do WhatsApp</CardTitle>
              <p className="mt-1 text-sm text-black/60">
                {robot?.connected
                  ? 'Conectado e enviando sinais ao painel'
                  : robot?.monitored
                    ? 'Sem sinal recente — confira o computador do robô'
                    : 'Monitoramento ainda não ativado no arquivo do robô'}
              </p>
            </div>
          </div>
          <Badge
            className={
              robot?.connected
                ? 'bg-emerald-700 text-white'
                : 'bg-amber-700 text-white'
            }
          >
            {robot?.connected
              ? 'Conectado'
              : robot?.monitored
                ? 'Atenção'
                : 'Aguardando configuração'}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-black/50">Último sinal</p>
            <p className="mt-1 font-bold">
              {dateTime(robot?.lastHeartbeatAt ?? null)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-black/50">Último envio</p>
            <p className="mt-1 font-bold">
              {dateTime(robot?.lastMessageSentAt ?? null)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-black/50">Revisão das 15h</p>
            <p className="mt-1 font-bold">
              {dateTime(robot?.lastDailyReviewAt ?? null)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-black/50">Mensagens</p>
            <p className="mt-1 font-bold">
              {robot?.pendingCount ?? 0} pendentes · {robot?.failedCount ?? 0}{' '}
              com erro
            </p>
            {robot?.version ? (
              <p className="mt-1 text-xs text-black/50">
                Versão {robot.version}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Filtrar pendências"
      >
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${filter === 'all' ? 'bg-black text-white' : 'border border-black/12 bg-white text-black/65'}`}
        >
          Todas ({items.length})
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${filter === category ? 'bg-black text-white' : 'border border-black/12 bg-white text-black/65'}`}
          >
            {categoryLabels[category]} (
            {items.filter((item) => item.category === category).length})
          </button>
        ))}
      </div>

      <section className="space-y-3" aria-label="Pendências abertas">
        {loading ? (
          <div className="grid min-h-40 place-items-center rounded-2xl bg-white">
            <p className="flex items-center gap-2 text-sm text-black/60">
              <LoaderCircle className="size-4 animate-spin" /> Organizando
              pendências...
            </p>
          </div>
        ) : null}
        {!loading && !visible.length ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center">
            <CheckCheck className="mx-auto size-10 text-emerald-700" />
            <h2 className="mt-4 text-xl font-bold">
              Tudo em dia nesta categoria
            </h2>
            <p className="mt-2 text-sm text-black/60">
              Nenhuma ação está aguardando a equipe agora.
            </p>
          </div>
        ) : null}
        {visible.map((task) => (
          <article
            key={task.id}
            className={`rounded-2xl border bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,0.08)] sm:p-5 ${task.priority >= 4 ? 'border-l-4 border-l-red-600' : task.workflowStatus === 'claimed' ? 'border-l-4 border-l-amber-600' : 'border-black/12'}`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-[#f4e7d7] text-[#68401f]"
                  >
                    {categoryLabels[task.category]}
                  </Badge>
                  {task.priority >= 4 ? (
                    <Badge className="bg-red-700 text-white">
                      Prioridade alta
                    </Badge>
                  ) : null}
                  {task.workflowStatus === 'claimed' ? (
                    <Badge className="bg-amber-700 text-white">
                      Assumida por {task.workflowActorName}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Nova</Badge>
                  )}
                </div>
                <h2 className="mt-3 text-lg font-extrabold text-black">
                  {task.title}
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-black/65">
                  {task.description}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-black/45">
                  <Clock3 className="size-3.5" /> {dateTime(task.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:max-w-[25rem] lg:justify-end">
                <Link
                  href={task.href}
                  className={buttonVariants({
                    size: 'sm',
                    variant: 'outline',
                    className: 'bg-white',
                  })}
                >
                  Abrir <ChevronRight />
                </Link>
                {task.workflowStatus !== 'claimed' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === task.id}
                    onClick={() => void changeState(task, 'claim')}
                  >
                    <UserRoundCheck /> Assumir
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  disabled={busyId === task.id}
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                  onClick={() => void changeState(task, 'resolve')}
                >
                  {busyId === task.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Check />
                  )}{' '}
                  Resolvida
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === task.id}
                  className="text-black/55"
                  onClick={() => void changeState(task, 'dismiss')}
                >
                  <X /> Dispensar
                </Button>
              </div>
            </div>
          </article>
        ))}
      </section>
      <p className="flex items-center gap-2 rounded-xl bg-[#f4e7d7] px-4 py-3 text-sm font-medium text-[#68401f]">
        <MessageCircleWarning className="size-4 shrink-0" /> Resolver ou
        dispensar uma pendência não altera automaticamente a reserva ou a fila.
        Use “Abrir” quando a situação também precisar ser atualizada.
      </p>
    </div>
  );
}
