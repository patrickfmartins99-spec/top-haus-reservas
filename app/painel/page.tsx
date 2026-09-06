'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ListOrdered,
  LoaderCircle,
  Plus,
  UserRoundX,
  Users,
} from 'lucide-react';

import { ReasonDialog } from '@/components/reason-dialog';
import { OfflineModeBanner } from '@/components/offline-mode-banner';
import { ReservationCards } from '@/components/reservation-cards';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatDurationClock,
  waitDurationMilliseconds,
} from '@/lib/domain/waitlist-time';
import { RESERVATION_NO_SHOW_REASONS } from '@/lib/domain/service-outcomes';
import { getFirebaseClient } from '@/lib/firebase/client';
import { fetchWithTimeout } from '@/lib/client/fetch-with-timeout';
import {
  cacheBelongsToToday,
  readStaffCache,
  writeStaffCache,
} from '@/lib/offline/staff-cache';

type Reservation = {
  id: string;
  customerName: string;
  partySize: number;
  service: string;
  serviceDate: string;
  arrivalTime: string;
  status: string;
  tableLabel: string;
};

type QueueEntry = {
  id: string;
  customerName: string;
  partySize: number;
  status: string;
  enteredAt: string | null;
  calledAt: string | null;
};

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [noShowReservation, setNoShowReservation] =
    useState<Reservation | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadLiveData = useCallback(async (user: User) => {
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };
    const today = localDate();
    const [reservationsResponse, queueResponse] = await Promise.all([
      fetchWithTimeout(`/api/reservas?data=${today}`, { headers }),
      fetchWithTimeout('/api/fila?ativas=1', { headers }),
    ]);
    const reservationsData = await reservationsResponse.json();
    const queueData = await queueResponse.json();
    if (!reservationsResponse.ok)
      throw new Error(
        reservationsData.error ?? 'Não foi possível carregar as reservas.',
      );
    if (!queueResponse.ok)
      throw new Error(queueData.error ?? 'Não foi possível carregar a fila.');
    setReservations(reservationsData.reservations);
    setQueue(queueData.entries);
    writeStaffCache('reservations', reservationsData.reservations);
    writeStaffCache('waitlist', queueData.entries);
    setOfflineSavedAt(null);
  }, []);

  const loadCachedData = useCallback(() => {
    const cachedReservations = readStaffCache<Reservation[]>('reservations');
    const cachedQueue = readStaffCache<QueueEntry[]>('waitlist');
    const validReservations =
      cachedReservations && cacheBelongsToToday(cachedReservations.savedAt)
        ? cachedReservations
        : null;
    const validQueue =
      cachedQueue && cacheBelongsToToday(cachedQueue.savedAt)
        ? cachedQueue
        : null;
    if (!validReservations && !validQueue) return false;
    setReservations(validReservations?.value ?? []);
    setQueue(validQueue?.value ?? []);
    setOfflineSavedAt(
      [validReservations?.savedAt, validQueue?.savedAt]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString(),
    );
    return true;
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
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      setCurrentUser(user);
      try {
        await loadLiveData(user);
      } catch (caughtError) {
        if (!loadCachedData())
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Não foi possível carregar a visão geral.',
          );
      } finally {
        setLoading(false);
      }
    });
  }, [loadCachedData, loadLiveData]);

  async function retryLiveData() {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      await loadLiveData(currentUser);
    } catch {
      setError('A conexão ainda não voltou. A última cópia foi mantida.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayReservations = useMemo(
    () =>
      reservations
        .filter(
          (reservation) =>
            reservation.serviceDate === localDate() &&
            !['cancelled', 'no_show', 'completed', 'seated'].includes(
              reservation.status,
            ),
        )
        .sort((first, second) =>
          first.arrivalTime.localeCompare(second.arrivalTime),
        ),
    [reservations],
  );
  const activeQueue = useMemo(
    () =>
      queue.filter(
        (entry) => entry.status === 'waiting' || entry.status === 'called',
      ),
    [queue],
  );
  const reservedPeople = todayReservations.reduce(
    (sum, reservation) => sum + reservation.partySize,
    0,
  );
  const pendingReservations = todayReservations.filter(
    (reservation) => reservation.status === 'pending_approval',
  );
  const confirmedReservations = todayReservations.filter(
    (reservation) => reservation.status !== 'pending_approval',
  );

  async function updateReservationStatus(
    reservation: Reservation,
    status: 'seated' | 'no_show',
    reason = '',
    note = '',
  ) {
    if (!currentUser) return;
    setActionBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/reservas/${reservation.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await currentUser.getIdToken()}`,
        },
        body: JSON.stringify({ action: 'set_status', status, reason, note }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível atualizar a reserva.');
      setReservations((current) => {
        const next = current.filter((item) => item.id !== reservation.id);
        writeStaffCache('reservations', next);
        return next;
      });
      setNoShowReservation(null);
      setSuccess(
        status === 'seated'
          ? `Chegada de ${reservation.customerName} confirmada.`
          : `${reservation.customerName} registrado como não comparecimento.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível atualizar a reserva.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">
            Visão geral
          </p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">
            Reservas de hoje
          </h1>
          <p className="mt-1 text-sm text-haus-ink/65">
            Atendimentos do dia em primeiro lugar. Abra uma reserva para editar
            ou enviar mensagens.
          </p>
        </div>
        <div className="w-full sm:w-auto">
          {offlineSavedAt ? (
            <span
              className={buttonVariants({
                className:
                  'h-11 w-full cursor-not-allowed bg-black/45 px-3 text-white sm:h-10 sm:w-auto sm:px-4',
              })}
            >
              <Plus className="size-4" /> Nova reserva
            </span>
          ) : (
            <Link
              href="/painel/reservas/nova"
              className={buttonVariants({
                className:
                  'h-11 w-full bg-black px-3 text-white hover:bg-black/85 sm:h-10 sm:w-auto sm:px-4',
              })}
            >
              <Plus className="size-4" /> Nova reserva
            </Link>
          )}
        </div>
      </div>

      {offlineSavedAt ? (
        <OfflineModeBanner
          savedAt={offlineSavedAt}
          retrying={loading}
          onRetry={() => void retryLiveData()}
        />
      ) : null}

      {error ? (
        <p
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
          {success}
        </output>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6">
            <div>
              <CardTitle className="font-heading text-xl font-bold">
                Atendimentos de hoje
              </CardTitle>
              <p className="mt-1 text-sm font-medium text-haus-ink/65">
                Reservas ativas dos dois serviços
              </p>
            </div>
            <Badge variant="outline">{todayReservations.length}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/65">
                <LoaderCircle className="size-4 animate-spin" /> Carregando
                dados...
              </p>
            ) : null}
            {!loading && todayReservations.length === 0 ? (
              <p className="py-12 text-center text-sm text-black/65">
                Nenhuma reserva registrada para hoje.
              </p>
            ) : null}
            {!loading && todayReservations.length > 0 ? (
              <ReservationCards
                items={todayReservations}
                actions={(item) => {
                  const reservation = todayReservations.find(
                    (current) => current.id === item.id,
                  )!;
                  return (
                    <>
                      <Button
                        disabled={actionBusy || Boolean(offlineSavedAt)}
                        size="sm"
                        className="bg-black text-white hover:bg-black/85"
                        onClick={() =>
                          void updateReservationStatus(reservation, 'seated')
                        }
                      >
                        <CheckCircle2 /> Confirmar chegada
                      </Button>
                      <Button
                        disabled={actionBusy || Boolean(offlineSavedAt)}
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => setNoShowReservation(reservation)}
                      >
                        <UserRoundX /> No show
                      </Button>
                      <Link
                        href={'/painel/reservas?busca=' + item.id}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        Abrir reserva
                      </Link>
                    </>
                  );
                }}
              />
            ) : null}{' '}
            <Link
              href="/painel/reservas"
              className={buttonVariants({
                variant: 'outline',
                className: 'mt-5 w-full',
              })}
            >
              <CalendarDays /> Ver todas as reservas
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6">
            <div>
              <CardTitle className="font-heading text-xl font-bold">
                Fila de espera
              </CardTitle>
              <p className="mt-1 text-sm font-medium text-haus-ink/65">
                Ordem atual de atendimento
              </p>
            </div>
            <Badge className="bg-haus-terracotta text-white">
              {activeQueue.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {!loading && activeQueue.length === 0 ? (
              <p className="py-8 text-center text-sm text-black/65">
                Nenhum cliente aguardando.
              </p>
            ) : null}
            {activeQueue.map((entry, index) => (
              <article
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3 shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {entry.customerName}
                  </p>
                  <p className="text-sm font-medium text-haus-ink/65">
                    {entry.partySize} pessoas ·{' '}
                    {entry.status === 'called' ? 'aguardou' : 'aguardando há'}{' '}
                    <span className="font-mono font-bold text-haus-ink">
                      {formatDurationClock(
                        waitDurationMilliseconds(entry, now),
                      )}
                    </span>
                  </p>
                </div>
              </article>
            ))}
            <Link
              href="/painel/fila"
              className={buttonVariants({
                variant: 'ghost',
                className:
                  'w-full text-haus-terracotta hover:text-haus-terracotta',
              })}
            >
              Ver fila completa
            </Link>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: 'Pessoas reservadas',
            value: reservedPeople,
            detail: 'almoço + rodízio de hoje',
            icon: Users,
          },
          {
            label: 'Reservas',
            value: todayReservations.length,
            detail: `${confirmedReservations.length} confirmadas`,
            icon: ClipboardList,
          },
          {
            label: 'Aguardando aprovação',
            value: pendingReservations.length,
            detail: pendingReservations.length
              ? `${pendingReservations.reduce((sum, item) => sum + item.partySize, 0)} pessoas`
              : 'nenhuma pendência',
            icon: Clock3,
          },
          {
            label: 'Fila de espera',
            value: activeQueue.length,
            detail: activeQueue.length
              ? `${activeQueue.reduce((sum, item) => sum + item.partySize, 0)} pessoas`
              : 'fila vazia',
            icon: ListOrdered,
          },
        ].map(({ label, value, detail, icon: Icon }) => (
          <Card
            key={label}
            className="gap-3 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.07)] ring-black/7"
          >
            <CardHeader className="flex-row items-center justify-between">
              <p className="text-sm text-haus-ink/65">{label}</p>
              <span className="grid size-8 place-items-center rounded-lg bg-[#eadcd2] text-haus-terracotta">
                <Icon className="size-4" />
              </span>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-3xl font-bold">
                {loading ? '—' : value}
              </p>
              <p className="mt-1 text-xs font-medium text-haus-ink/65">
                {detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ReasonDialog
        key={noShowReservation?.id ?? 'no-reservation'}
        open={noShowReservation !== null}
        title={`Registrar no show de ${noShowReservation?.customerName ?? ''}?`}
        description="A reserva sairá da visão geral, os lugares serão liberados e o motivo ficará disponível nos relatórios."
        options={RESERVATION_NO_SHOW_REASONS}
        confirmLabel="Registrar no show"
        busy={actionBusy}
        onOpenChange={(open) => !open && setNoShowReservation(null)}
        onConfirm={(reason, note) =>
          noShowReservation
            ? updateReservationStatus(
                noShowReservation,
                'no_show',
                reason,
                note,
              )
            : undefined
        }
      />
    </div>
  );
}
