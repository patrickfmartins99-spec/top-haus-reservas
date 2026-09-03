'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { CalendarDays, ClipboardList, Clock3, ListOrdered, LoaderCircle, Plus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDurationClock, waitDurationMilliseconds } from '@/lib/domain/waitlist-time';
import { getFirebaseClient } from '@/lib/firebase/client';

type Reservation = {
  id: string;
  customerName: string;
  partySize: number;
  service: string;
  serviceDate: string;
  arrivalTime: string;
  status: string;
};

type QueueEntry = {
  id: string;
  customerName: string;
  partySize: number;
  status: string;
  enteredAt: string | null;
  calledAt: string | null;
};

const statusLabels: Record<string, string> = {
  pending_approval: 'Aguardando aprovação',
  confirmed: 'Confirmada',
  presence_confirmed: 'Presença confirmada',
  seated: 'Cliente chegou',
};

function statusClass(status: string) {
  if (status === 'pending_approval') return 'bg-haus-gold/20 text-[#6b451c]';
  if (status === 'presence_confirmed' || status === 'seated') return 'bg-black text-white';
  return 'bg-[#e7e1db] text-[#4f3528]';
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export default function DashboardPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => { setError('Firebase não configurado.'); setLoading(false); }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [reservationsResponse, queueResponse] = await Promise.all([
          fetch('/api/reservas', { headers }),
          fetch('/api/fila', { headers }),
        ]);
        const reservationsData = await reservationsResponse.json();
        const queueData = await queueResponse.json();
        if (!reservationsResponse.ok) throw new Error(reservationsData.error ?? 'Não foi possível carregar as reservas.');
        if (!queueResponse.ok) throw new Error(queueData.error ?? 'Não foi possível carregar a fila.');
        setReservations(reservationsData.reservations);
        setQueue(queueData.entries);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível carregar a visão geral.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayReservations = useMemo(() => reservations
    .filter((reservation) => reservation.serviceDate === localDate() && !['cancelled', 'no_show', 'completed'].includes(reservation.status))
    .sort((first, second) => first.arrivalTime.localeCompare(second.arrivalTime)), [reservations]);
  const activeQueue = useMemo(() => queue.filter((entry) => entry.status === 'waiting' || entry.status === 'called'), [queue]);
  const reservedPeople = todayReservations.reduce((sum, reservation) => sum + reservation.partySize, 0);
  const pendingReservations = todayReservations.filter((reservation) => reservation.status === 'pending_approval');
  const confirmedReservations = todayReservations.filter((reservation) => reservation.status !== 'pending_approval');

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Visão geral</p><h1 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">Reservas de hoje</h1><p className="mt-1 text-sm text-haus-ink/65">Acompanhe almoço, rodízio e fila de espera em tempo real.</p></div>
        <Link href="/painel/reservas/nova" className={buttonVariants({ className: 'h-10 bg-black px-4 text-white hover:bg-black/85' })}><Plus className="size-4" /> Nova reserva</Link>
      </div>

      <div className="rounded-xl border border-haus-gold/45 bg-[#f4e7d7] px-4 py-3 text-sm text-haus-ink/80"><strong>Dados reais.</strong> Esta tela agora é atualizada diretamente pelas reservas e pela fila salvas no Firebase.</div>
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pessoas reservadas', value: reservedPeople, detail: 'almoço + rodízio de hoje', icon: Users },
          { label: 'Reservas', value: todayReservations.length, detail: `${confirmedReservations.length} confirmadas`, icon: ClipboardList },
          { label: 'Aguardando aprovação', value: pendingReservations.length, detail: pendingReservations.length ? `${pendingReservations.reduce((sum, item) => sum + item.partySize, 0)} pessoas` : 'nenhuma pendência', icon: Clock3 },
          { label: 'Fila de espera', value: activeQueue.length, detail: activeQueue.length ? `${activeQueue.reduce((sum, item) => sum + item.partySize, 0)} pessoas` : 'fila vazia', icon: ListOrdered },
        ].map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="gap-3 bg-white ring-black/7"><CardHeader className="flex-row items-center justify-between"><p className="text-sm text-haus-ink/65">{label}</p><span className="grid size-8 place-items-center rounded-lg bg-[#eadcd2] text-haus-terracotta"><Icon className="size-4" /></span></CardHeader><CardContent><p className="font-heading text-3xl font-bold">{loading ? '—' : value}</p><p className="mt-1 text-xs font-medium text-haus-ink/65">{detail}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="bg-white ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6"><div><CardTitle className="font-heading text-xl font-bold">Atendimentos de hoje</CardTitle><p className="mt-1 text-xs font-medium text-haus-ink/65">Reservas ativas dos dois serviços</p></div><Badge variant="outline">{todayReservations.length}</Badge></CardHeader>
          <CardContent>
            {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/65"><LoaderCircle className="size-4 animate-spin" /> Carregando dados...</p> : null}
            {!loading && todayReservations.length === 0 ? <p className="py-12 text-center text-sm text-black/65">Nenhuma reserva registrada para hoje.</p> : null}
            {!loading && todayReservations.length > 0 ? <Table><TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Pessoas</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>
              {todayReservations.map((reservation) => <TableRow key={reservation.id}><TableCell>{reservation.service === 'almoco' ? 'Almoço' : 'Rodízio'}</TableCell><TableCell className="font-semibold">{reservation.arrivalTime}</TableCell><TableCell><p className="font-semibold">{reservation.customerName}</p><p className="font-mono text-[11px] font-semibold text-black/65">{reservation.id}</p></TableCell><TableCell>{reservation.partySize}</TableCell><TableCell><Badge className={statusClass(reservation.status)}>{statusLabels[reservation.status] ?? reservation.status}</Badge></TableCell></TableRow>)}
            </TableBody></Table> : null}
            <Link href="/painel/reservas" className={buttonVariants({ variant: 'outline', className: 'mt-5 w-full' })}><CalendarDays /> Ver todas as reservas</Link>
          </CardContent>
        </Card>

        <Card className="bg-white ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6"><div><CardTitle className="font-heading text-xl font-bold">Fila de espera</CardTitle><p className="mt-1 text-xs font-medium text-haus-ink/65">Ordem atual de atendimento</p></div><Badge className="bg-haus-terracotta text-white">{activeQueue.length}</Badge></CardHeader>
          <CardContent className="space-y-3">
            {!loading && activeQueue.length === 0 ? <p className="py-8 text-center text-sm text-black/65">Nenhum cliente aguardando.</p> : null}
            {activeQueue.map((entry, index) => <article key={entry.id} className="flex items-center gap-3 rounded-xl border border-black/7 p-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.customerName}</p><p className="text-xs font-medium text-haus-ink/65">{entry.partySize} pessoas · {entry.status === 'called' ? 'aguardou' : 'aguardando há'} <span className="font-mono font-bold text-haus-ink">{formatDurationClock(waitDurationMilliseconds(entry, now))}</span></p></div></article>)}
            <Link href="/painel/fila" className={buttonVariants({ variant: 'ghost', className: 'w-full text-haus-terracotta hover:text-haus-terracotta' })}>Ver fila completa</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
