'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CalendarDays, LoaderCircle, Plus, Search, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getFirebaseClient } from '@/lib/firebase/client';

type Reservation = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  service: string;
  serviceDate: string;
  arrivalTime: string;
  seatingPreference: string;
  status: string;
  source: string;
};

const statusLabels: Record<string, string> = {
  pending_approval: 'Aguardando aprovação',
  confirmed: 'Confirmada',
  presence_confirmed: 'Presença confirmada',
  cancelled: 'Cancelada',
  seated: 'Cliente chegou',
  no_show: 'Não compareceu',
  completed: 'Concluída',
};

function statusClass(status: string) {
  if (status === 'pending_approval') return 'bg-haus-gold/20 text-[#6b451c]';
  if (status === 'presence_confirmed' || status === 'seated') return 'bg-black text-white';
  if (status === 'cancelled' || status === 'no_show') return 'bg-destructive/10 text-destructive';
  return 'bg-[#e7e1db] text-[#4f3528]';
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

async function loadReservations(user: User) {
  const token = await user.getIdToken();
  const response = await fetch('/api/reservas', { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar as reservas.');
  return data.reservations as Reservation[];
}

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get('criada');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('todos');

  const refresh = useCallback(async (user: User) => {
    setReservations(await loadReservations(user));
  }, []);

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => { setError('Firebase não configurado.'); setLoading(false); }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      try { await refresh(user); }
      catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível carregar as reservas.'); }
      finally { setLoading(false); }
    });
  }, [refresh]);

  const filteredReservations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reservations.filter((reservation) => {
      const matchesSearch = !term || reservation.customerName.toLowerCase().includes(term) || reservation.whatsapp.includes(term) || reservation.id.toLowerCase().includes(term);
      const matchesDate = !dateFilter || reservation.serviceDate === dateFilter;
      const matchesService = serviceFilter === 'todos' || reservation.service === serviceFilter;
      return matchesSearch && matchesDate && matchesService;
    });
  }, [dateFilter, reservations, search, serviceFilter]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Reservas</h1><p className="mt-1 text-sm text-black/55">Consulte e acompanhe todas as reservas registradas no Firebase.</p></div>
        <Link href="/painel/reservas/nova" className={buttonVariants({ className: 'bg-black text-white hover:bg-black/85' })}><Plus /> Nova reserva</Link>
      </div>

      {createdId ? <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Reserva salva e incluída na listagem. Código: {createdId}</output> : null}
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/50">Reservas encontradas</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.length}</p></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/50">Pessoas reservadas</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.reduce((sum, item) => sum + item.partySize, 0)}</p></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/50">Aguardando aprovação</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.filter((item) => item.status === 'pending_approval').length}</p></CardContent></Card>
      </div>

      <Card className="bg-white ring-black/7">
        <CardHeader className="gap-4 border-b border-black/7 lg:flex-row lg:items-center lg:justify-between">
          <div><CardTitle className="text-xl font-bold">Todas as reservas</CardTitle><p className="mt-1 text-sm text-black/50">Use os filtros para localizar um atendimento.</p></div>
          <div className="grid gap-2 sm:grid-cols-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" /><Input aria-label="Buscar reserva" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente ou WhatsApp" className="pl-9" /></div><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" /><Input aria-label="Filtrar por data" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="pl-9" /></div><NativeSelect aria-label="Filtrar por serviço" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className="w-full"><NativeSelectOption value="todos">Todos os serviços</NativeSelectOption><NativeSelectOption value="almoco">Almoço</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio</NativeSelectOption></NativeSelect></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/50"><LoaderCircle className="size-4 animate-spin" /> Carregando reservas...</p> : null}
          {!loading && filteredReservations.length === 0 ? <p className="py-12 text-center text-sm text-black/50">Nenhuma reserva encontrada.</p> : null}
          {!loading && filteredReservations.length > 0 ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Contato</TableHead><TableHead>Pessoas</TableHead><TableHead>Serviço</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>
            {filteredReservations.map((reservation) => <TableRow key={reservation.id} className={createdId === reservation.id ? 'bg-[#f4e7d7]' : undefined}><TableCell className="font-semibold">{formatDate(reservation.serviceDate)}</TableCell><TableCell className="font-bold">{reservation.arrivalTime}</TableCell><TableCell><p className="font-semibold">{reservation.customerName}</p><p className="font-mono text-[10px] text-black/35">{reservation.id}</p></TableCell><TableCell className="text-black/55">{formatPhone(reservation.whatsapp)}</TableCell><TableCell><span className="flex items-center gap-1"><Users className="size-4 text-haus-terracotta" /> {reservation.partySize}</span></TableCell><TableCell className="capitalize">{reservation.service === 'almoco' ? 'Almoço' : 'Rodízio'}</TableCell><TableCell><Badge className={statusClass(reservation.status)}>{statusLabels[reservation.status] ?? reservation.status}</Badge></TableCell></TableRow>)}
          </TableBody></Table> : null}
        </CardContent>
      </Card>
    </div>
  );
}
