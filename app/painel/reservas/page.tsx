'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { CalendarDays, LoaderCircle, MessageCircle, Pencil, Plus, Save, Search, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getFirebaseClient } from '@/lib/firebase/client';
import { buildWhatsAppUrl, reservationMessage } from '@/lib/whatsapp';

type Reservation = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  service: string;
  serviceDate: string;
  arrivalTime: string;
  status: string;
  source: string;
  notes: string;
};

const times: Record<string, string[]> = {
  almoco: ['11:00', '11:15', '11:30'],
  rodizio: ['18:30', '18:45', '19:00'],
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState(searchParams.get('busca') ?? '');
  const [dateFilter, setDateFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('todos');
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);

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
      setCurrentUser(user);
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

  function startEditing(reservation: Reservation) {
    setEditingReservation({ ...reservation });
    setError('');
    setSuccess('');
  }

  function updateDraft<Key extends keyof Reservation>(key: Key, value: Reservation[Key]) {
    setEditingReservation((current) => current ? { ...current, [key]: value } : current);
  }

  function changeDraftService(service: string) {
    setEditingReservation((current) => current ? { ...current, service, arrivalTime: times[service][0] } : current);
  }

  async function saveReservation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !editingReservation) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/reservas/${editingReservation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingReservation),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível alterar a reserva.');
      const editedName = editingReservation.customerName;
      setEditingReservation(null);
      await refresh(currentUser);
      setSuccess(`Reserva de ${editedName} atualizada com sucesso.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível alterar a reserva.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Reservas</h1><p className="mt-1 text-sm text-black/65">Consulte e acompanhe todas as reservas registradas no Firebase.</p></div>
        <Link href="/painel/reservas/nova" className={buttonVariants({ className: 'bg-black text-white hover:bg-black/85' })}><Plus /> Nova reserva</Link>
      </div>

      {createdId ? <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">Reserva salva e incluída na listagem. Código: {createdId}</output> : null}
      {success ? <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">{success}</output> : null}
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/65">Reservas encontradas</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.length}</p></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/65">Pessoas reservadas</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.reduce((sum, item) => sum + item.partySize, 0)}</p></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardContent><p className="text-sm text-black/65">Aguardando aprovação</p><p className="mt-2 text-3xl font-extrabold">{filteredReservations.filter((item) => item.status === 'pending_approval').length}</p></CardContent></Card>
      </div>

      <Card className="bg-white ring-black/7">
        <CardHeader className="gap-4 border-b border-black/7 lg:flex-row lg:items-center lg:justify-between">
          <div><CardTitle className="text-xl font-bold">Todas as reservas</CardTitle><p className="mt-1 text-sm text-black/65">Use os filtros para localizar um atendimento.</p></div>
          <div className="grid gap-2 sm:grid-cols-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/55" /><Input aria-label="Buscar reserva" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente ou WhatsApp" className="pl-9" /></div><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/55" /><Input aria-label="Filtrar por data" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="pl-9" /></div><NativeSelect aria-label="Filtrar por serviço" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className="w-full"><NativeSelectOption value="todos">Todos os serviços</NativeSelectOption><NativeSelectOption value="almoco">Almoço</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio</NativeSelectOption></NativeSelect></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/65"><LoaderCircle className="size-4 animate-spin" /> Carregando reservas...</p> : null}
          {!loading && filteredReservations.length === 0 ? <p className="py-12 text-center text-sm text-black/65">Nenhuma reserva encontrada.</p> : null}
          {!loading && filteredReservations.length > 0 ? <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Contato</TableHead><TableHead>Pessoas</TableHead><TableHead>Serviço</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>
            {filteredReservations.map((reservation) => {
              const whatsappUrl = buildWhatsAppUrl(reservation.whatsapp, reservationMessage(reservation));
              return <TableRow key={reservation.id} className={createdId === reservation.id ? 'bg-[#f4e7d7]' : undefined}><TableCell className="font-semibold">{formatDate(reservation.serviceDate)}</TableCell><TableCell className="font-bold">{reservation.arrivalTime}</TableCell><TableCell><p className="font-semibold">{reservation.customerName}</p><p className="font-mono text-[11px] font-semibold text-black/65">{reservation.id}</p></TableCell><TableCell className="font-medium text-black/70">{formatPhone(reservation.whatsapp)}</TableCell><TableCell><span className="flex items-center gap-1"><Users className="size-4 text-haus-terracotta" /> {reservation.partySize}</span></TableCell><TableCell className="capitalize">{reservation.service === 'almoco' ? 'Almoço' : 'Rodízio'}</TableCell><TableCell><Badge className={statusClass(reservation.status)}>{statusLabels[reservation.status] ?? reservation.status}</Badge></TableCell><TableCell><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => startEditing(reservation)}><Pencil /> Editar</Button>{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-haus-terracotta' })}><MessageCircle /> WhatsApp</a> : null}</div></TableCell></TableRow>;
            })}
          </TableBody></Table> : null}
        </CardContent>
      </Card>

      <Dialog open={editingReservation !== null} onOpenChange={(open) => { if (!open) setEditingReservation(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          {editingReservation ? <form onSubmit={saveReservation}>
            <DialogHeader><DialogTitle className="text-xl font-bold">Editar reserva</DialogTitle><DialogDescription className="text-black/65">Código {editingReservation.id}. As alterações ficarão registradas na auditoria.</DialogDescription></DialogHeader>
            {error ? <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="edit-reservation-name">Nome do cliente</Label><Input id="edit-reservation-name" value={editingReservation.customerName} onChange={(event) => updateDraft('customerName', event.target.value)} minLength={2} required /></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-phone">WhatsApp</Label><Input id="edit-reservation-phone" value={editingReservation.whatsapp} onChange={(event) => updateDraft('whatsapp', event.target.value)} inputMode="tel" minLength={10} required /></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-date">Data</Label><Input id="edit-reservation-date" type="date" value={editingReservation.serviceDate} onChange={(event) => updateDraft('serviceDate', event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-service">Serviço</Label><NativeSelect id="edit-reservation-service" value={editingReservation.service} onChange={(event) => changeDraftService(event.target.value)} className="w-full"><NativeSelectOption value="almoco">Almoço</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio</NativeSelectOption></NativeSelect></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-time">Horário</Label><NativeSelect id="edit-reservation-time" value={editingReservation.arrivalTime} onChange={(event) => updateDraft('arrivalTime', event.target.value)} className="w-full">{times[editingReservation.service].map((time) => <NativeSelectOption key={time} value={time}>{time}</NativeSelectOption>)}</NativeSelect></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-party">Pessoas</Label><Input id="edit-reservation-party" type="number" value={editingReservation.partySize} onChange={(event) => updateDraft('partySize', Number(event.target.value))} min={1} required /></div>
              <div className="space-y-2"><Label htmlFor="edit-reservation-status">Situação</Label><NativeSelect id="edit-reservation-status" value={editingReservation.status} onChange={(event) => updateDraft('status', event.target.value)} className="w-full"><NativeSelectOption value="pending_approval">Aguardando aprovação</NativeSelectOption><NativeSelectOption value="confirmed">Confirmada</NativeSelectOption><NativeSelectOption value="presence_confirmed">Presença confirmada</NativeSelectOption><NativeSelectOption value="seated">Cliente chegou</NativeSelectOption><NativeSelectOption value="completed">Concluída</NativeSelectOption><NativeSelectOption value="cancelled">Cancelada</NativeSelectOption><NativeSelectOption value="no_show">Não compareceu</NativeSelectOption></NativeSelect></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-reservation-notes">Observações</Label><Textarea id="edit-reservation-notes" value={editingReservation.notes} onChange={(event) => updateDraft('notes', event.target.value)} maxLength={1000} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingReservation(null)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-black text-white hover:bg-black/85">{saving ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar alterações</Button></DialogFooter>
          </form> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
