'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  CalendarDays,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';

import { ReasonDialog } from '@/components/reason-dialog';
import { ReservationCards } from '@/components/reservation-cards';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  RESERVATION_CANCELLATION_REASONS,
  RESERVATION_NO_SHOW_REASONS,
} from '@/lib/domain/service-outcomes';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { SpecialDateException } from '@/lib/domain/special-dates';

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
  tableLabel: string;
  cancellationReason: string;
  cancellationReasonLabel: string;
  cancellationNote: string;
  outcomeReason: string;
  outcomeReasonLabel: string;
  outcomeNote: string;
};

const times: Record<string, string[]> = {
  almoco: ['11:00', '11:15', '11:30'],
  rodizio: ['18:30', '18:45', '19:00'],
};

async function loadReservations(user: User) {
  const token = await user.getIdToken();
  const response = await fetch('/api/reservas', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? 'Não foi possível carregar as reservas.');
  return data.reservations as Reservation[];
}

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get('criada');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [exceptions, setExceptions] = useState<SpecialDateException[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState(searchParams.get('busca') ?? '');
  const [dateFilter, setDateFilter] = useState(() =>
    searchParams.get('busca') || searchParams.get('criada')
      ? ''
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
        }).format(new Date()),
  );
  const [serviceFilter, setServiceFilter] = useState('todos');
  const [deleting, setDeleting] = useState<Reservation | null>(null);
  async function removeReservation(reason: string, note: string) {
    if (!currentUser || !deleting) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/reservas/${deleting.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await currentUser.getIdToken()}`,
        },
        body: JSON.stringify({ reason, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDeleting(null);
      await refresh(currentUser);
      setSuccess(
        'Reserva cancelada. Lugares liberados e motivo registrado no relatório.',
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível cancelar.',
      );
    } finally {
      setSaving(false);
    }
  }
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);

  const refresh = useCallback(async (user: User) => {
    setReservations(await loadReservations(user));
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
        const [, publicSettings] = await Promise.all([
          refresh(user),
          fetch('/api/configuracoes/publicas').then((response) =>
            response.json(),
          ),
        ]);
        setExceptions(publicSettings.exceptions ?? []);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Não foi possível carregar as reservas.',
        );
      } finally {
        setLoading(false);
      }
    });
  }, [refresh]);

  const filteredReservations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reservations
      .filter((reservation) => {
        const matchesSearch =
          !term ||
          reservation.customerName.toLowerCase().includes(term) ||
          reservation.whatsapp.includes(term) ||
          reservation.id.toLowerCase().includes(term);
        const matchesDate =
          !dateFilter || reservation.serviceDate === dateFilter;
        const matchesService =
          serviceFilter === 'todos' || reservation.service === serviceFilter;
        return matchesSearch && matchesDate && matchesService;
      })
      .sort(
        (a, b) =>
          a.serviceDate.localeCompare(b.serviceDate) ||
          a.arrivalTime.localeCompare(b.arrivalTime),
      );
  }, [dateFilter, reservations, search, serviceFilter]);

  function startEditing(reservation: Reservation) {
    setEditingReservation({ ...reservation });
    setError('');
    setSuccess('');
  }

  function updateDraft<Key extends keyof Reservation>(
    key: Key,
    value: Reservation[Key],
  ) {
    setEditingReservation((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

  function changeDraftService(service: string) {
    setEditingReservation((current) =>
      current
        ? {
            ...current,
            service,
            arrivalTime:
              exceptions.find(
                (item) =>
                  item.serviceDate === current.serviceDate &&
                  item.service === service,
              )?.arrivalTimes[0] ?? times[service][0],
          }
        : current,
    );
  }

  function changeDraftDate(serviceDate: string) {
    setEditingReservation((current) => {
      if (!current) return current;
      const available = exceptions.find(
        (item) =>
          item.serviceDate === serviceDate && item.service === current.service,
      )?.arrivalTimes;
      const nextTimes = available?.length ? available : times[current.service];
      return {
        ...current,
        serviceDate,
        arrivalTime: nextTimes.includes(current.arrivalTime)
          ? current.arrivalTime
          : nextTimes[0],
      };
    });
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editingReservation),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível alterar a reserva.');
      const editedName = editingReservation.customerName;
      setEditingReservation(null);
      await refresh(currentUser);
      setSuccess(`Reserva de ${editedName} atualizada com sucesso.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível alterar a reserva.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">
            Atendimento
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
            Reservas
          </h1>
          <p className="mt-1 text-xs text-black/75">
            Consulte e acompanhe todas as reservas registradas no Firebase.
          </p>
        </div>
        <Link
          href="/painel/reservas/nova"
          className={buttonVariants({
            className: 'bg-black text-white hover:bg-black/85',
          })}
        >
          <Plus /> Nova reserva
        </Link>
      </div>

      {createdId ? (
        <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
          Reserva salva e incluída na listagem. Código: {createdId}
        </output>
      ) : null}
      {success ? (
        <output className="block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
          {success}
        </output>
      ) : null}
      {error ? (
        <p
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border border-black/10 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.07)]">
          <CardContent>
            <p className="text-sm text-black/65">Reservas encontradas</p>
            <p className="mt-2 text-3xl font-extrabold">
              {filteredReservations.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-black/10 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.07)]">
          <CardContent>
            <p className="text-sm text-black/65">Pessoas reservadas</p>
            <p className="mt-2 text-3xl font-extrabold">
              {filteredReservations
                .filter((item) =>
                  [
                    'pending_approval',
                    'confirmed',
                    'presence_confirmed',
                    'seated',
                  ].includes(item.status),
                )
                .reduce((sum, item) => sum + item.partySize, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-black/10 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.07)]">
          <CardContent>
            <p className="text-sm text-black/65">Aguardando aprovação</p>
            <p className="mt-2 text-3xl font-extrabold">
              {
                filteredReservations.filter(
                  (item) => item.status === 'pending_approval',
                ).length
              }
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-black/10 bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)]">
        <CardHeader className="gap-4 border-b border-black/7 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl font-bold">
              {dateFilter ? 'Reservas do dia' : 'Todas as reservas'}
            </CardTitle>
            <p className="mt-1 text-sm text-black/65">
              Use os filtros ou escolha outra data para localizar um
              atendimento.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/55" />
              <Input
                aria-label="Buscar reserva"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente ou WhatsApp"
                className="pl-9"
              />
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/55" />
              <Input
                aria-label="Filtrar por data"
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="pl-9"
              />
            </div>
            <NativeSelect
              aria-label="Filtrar por serviço"
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="todos">
                Todos os serviços
              </NativeSelectOption>
              <NativeSelectOption value="almoco">Almoço</NativeSelectOption>
              <NativeSelectOption value="rodizio">Rodízio</NativeSelectOption>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDateFilter(
                  new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date()),
                )
              }
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDateFilter('')}
            >
              Todas as datas
            </Button>
          </div>
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/65">
              <LoaderCircle className="size-4 animate-spin" /> Carregando
              reservas...
            </p>
          ) : null}
          {!loading && filteredReservations.length === 0 ? (
            <p className="py-12 text-center text-sm text-black/65">
              Nenhuma reserva encontrada.
            </p>
          ) : null}
          {!loading && filteredReservations.length > 0 ? (
            <ReservationCards
              items={filteredReservations}
              actions={(item) => {
                const reservation = filteredReservations.find(
                  (r) => r.id === item.id,
                )!;
                return (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(reservation)}
                    >
                      <Pencil /> Editar
                    </Button>
                    {!['cancelled', 'no_show', 'seated', 'completed'].includes(
                      reservation.status,
                    ) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-700"
                        onClick={() => {
                          setError('');
                          setDeleting(reservation);
                        }}
                      >
                        <Trash2 /> Cancelar
                      </Button>
                    ) : null}
                    <Link
                      href="/painel/mensagens"
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      <MessageCircle /> Mensagens
                    </Link>
                  </>
                );
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <ReasonDialog
        key={deleting?.id ?? 'no-reservation'}
        open={deleting !== null}
        title={`Cancelar reserva de ${deleting?.customerName ?? ''}?`}
        description="A reserva sairá das listas ativas e os lugares serão liberados. O motivo e o responsável ficarão registrados nos relatórios e na auditoria."
        options={RESERVATION_CANCELLATION_REASONS}
        confirmLabel="Confirmar cancelamento"
        busy={saving}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={removeReservation}
      />
      <Dialog
        open={editingReservation !== null}
        onOpenChange={(open) => {
          if (!open) setEditingReservation(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          {editingReservation ? (
            <form onSubmit={saveReservation}>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  Editar reserva
                </DialogTitle>
                <DialogDescription className="text-black/65">
                  Código {editingReservation.id}. As alterações ficarão
                  registradas na auditoria.
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <p
                  className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="grid gap-4 py-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-name">Nome do cliente</Label>
                  <Input
                    id="edit-reservation-name"
                    value={editingReservation.customerName}
                    onChange={(event) =>
                      updateDraft('customerName', event.target.value)
                    }
                    minLength={2}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-phone">WhatsApp</Label>
                  <Input
                    id="edit-reservation-phone"
                    value={editingReservation.whatsapp}
                    onChange={(event) =>
                      updateDraft('whatsapp', event.target.value)
                    }
                    inputMode="tel"
                    minLength={10}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-date">Data</Label>
                  <Input
                    id="edit-reservation-date"
                    type="date"
                    value={editingReservation.serviceDate}
                    onChange={(event) => changeDraftDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-service">Serviço</Label>
                  <NativeSelect
                    id="edit-reservation-service"
                    value={editingReservation.service}
                    onChange={(event) => changeDraftService(event.target.value)}
                    className="w-full"
                  >
                    <NativeSelectOption value="almoco">
                      Almoço
                    </NativeSelectOption>
                    <NativeSelectOption value="rodizio">
                      Rodízio
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-time">Horário</Label>
                  <NativeSelect
                    id="edit-reservation-time"
                    value={editingReservation.arrivalTime}
                    onChange={(event) =>
                      updateDraft('arrivalTime', event.target.value)
                    }
                    className="w-full"
                  >
                    {(exceptions.find(
                      (item) =>
                        item.serviceDate === editingReservation.serviceDate &&
                        item.service === editingReservation.service,
                    )?.arrivalTimes.length
                      ? exceptions.find(
                          (item) =>
                            item.serviceDate ===
                              editingReservation.serviceDate &&
                            item.service === editingReservation.service,
                        )!.arrivalTimes
                      : times[editingReservation.service]
                    ).map((time) => (
                      <NativeSelectOption key={time} value={time}>
                        {time}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-party">Pessoas</Label>
                  <Input
                    id="edit-reservation-party"
                    type="number"
                    value={editingReservation.partySize}
                    onChange={(event) =>
                      updateDraft('partySize', Number(event.target.value))
                    }
                    min={1}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reservation-status">Situação</Label>
                  <NativeSelect
                    id="edit-reservation-status"
                    value={editingReservation.status}
                    onChange={(event) =>
                      updateDraft('status', event.target.value)
                    }
                    className="w-full"
                  >
                    <NativeSelectOption value="pending_approval">
                      Aguardando aprovação
                    </NativeSelectOption>
                    <NativeSelectOption value="confirmed">
                      Confirmada
                    </NativeSelectOption>
                    <NativeSelectOption value="presence_confirmed">
                      Presença confirmada
                    </NativeSelectOption>
                    <NativeSelectOption value="seated">
                      Cliente chegou
                    </NativeSelectOption>
                    <NativeSelectOption value="completed">
                      Concluída
                    </NativeSelectOption>
                    <NativeSelectOption value="cancelled">
                      Cancelada
                    </NativeSelectOption>
                    <NativeSelectOption value="no_show">
                      Não compareceu
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                {editingReservation.status === 'cancelled' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cancellation-reason">
                        Motivo do cancelamento
                      </Label>
                      <NativeSelect
                        id="edit-cancellation-reason"
                        value={editingReservation.cancellationReason}
                        onChange={(event) =>
                          updateDraft('cancellationReason', event.target.value)
                        }
                        className="w-full"
                        required
                      >
                        <NativeSelectOption value="">
                          Selecione um motivo
                        </NativeSelectOption>
                        {RESERVATION_CANCELLATION_REASONS.map((reason) => (
                          <NativeSelectOption
                            key={reason.value}
                            value={reason.value}
                          >
                            {reason.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cancellation-note">
                        Detalhes{' '}
                        {editingReservation.cancellationReason === 'other'
                          ? '(obrigatório)'
                          : '(opcional)'}
                      </Label>
                      <Input
                        id="edit-cancellation-note"
                        value={editingReservation.cancellationNote}
                        onChange={(event) =>
                          updateDraft('cancellationNote', event.target.value)
                        }
                        maxLength={500}
                        required={
                          editingReservation.cancellationReason === 'other'
                        }
                      />
                    </div>
                  </>
                ) : null}
                {editingReservation.status === 'no_show' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-no-show-reason">
                        Motivo do no show
                      </Label>
                      <NativeSelect
                        id="edit-no-show-reason"
                        value={editingReservation.outcomeReason}
                        onChange={(event) =>
                          updateDraft('outcomeReason', event.target.value)
                        }
                        className="w-full"
                        required
                      >
                        <NativeSelectOption value="">
                          Selecione um motivo
                        </NativeSelectOption>
                        {RESERVATION_NO_SHOW_REASONS.map((reason) => (
                          <NativeSelectOption
                            key={reason.value}
                            value={reason.value}
                          >
                            {reason.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-no-show-note">
                        Detalhes{' '}
                        {editingReservation.outcomeReason === 'other'
                          ? '(obrigatório)'
                          : '(opcional)'}
                      </Label>
                      <Input
                        id="edit-no-show-note"
                        value={editingReservation.outcomeNote}
                        onChange={(event) =>
                          updateDraft('outcomeNote', event.target.value)
                        }
                        maxLength={500}
                        required={editingReservation.outcomeReason === 'other'}
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-reservation-notes">Observações</Label>
                  <Textarea
                    id="edit-reservation-notes"
                    value={editingReservation.notes}
                    onChange={(event) =>
                      updateDraft('notes', event.target.value)
                    }
                    maxLength={1000}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingReservation(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-black text-white hover:bg-black/85"
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Save />
                  )}{' '}
                  Salvar alterações
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
