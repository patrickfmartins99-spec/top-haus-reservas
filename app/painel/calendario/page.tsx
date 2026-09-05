'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  CalendarClock,
  CalendarX2,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { brazilDate, type ServiceType } from '@/lib/domain/reservations';
import type {
  SpecialDateException,
  SpecialDateMode,
} from '@/lib/domain/special-dates';
import { getFirebaseClient } from '@/lib/firebase/client';

type Draft = {
  serviceDate: string;
  service: ServiceType;
  mode: SpecialDateMode;
  bookingPaused: boolean;
  capacityLimit: string;
  arrivalTimes: string;
  customerNotice: string;
};

const emptyDraft = (): Draft => ({
  serviceDate: brazilDate(),
  service: 'rodizio',
  mode: 'open',
  bookingPaused: false,
  capacityLimit: '',
  arrivalTimes: '',
  customerNotice: '',
});

function serviceLabel(service: ServiceType) {
  return service === 'almoco' ? 'Almoço' : 'Rodízio';
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(`${value}T12:00:00-03:00`));
}

export default function SpecialDatesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<SpecialDateException[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removing, setRemoving] = useState<SpecialDateException | null>(null);

  async function authorizedFetch(path: string, init?: RequestInit) {
    const current = getFirebaseClient()?.auth.currentUser;
    if (!current) throw new Error('Sua sessão expirou. Entre novamente.');
    const token = await current.getIdToken();
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, {
      ...init,
      headers,
    });
  }

  async function load() {
    const response = await authorizedFetch('/api/datas-especiais');
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? 'Não foi possível carregar o calendário.');
    setItems(data.exceptions ?? []);
  }

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => {
        setError('Firebase não configurado.');
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, async (current) => {
      if (!current) return;
      setUser(current);
      try {
        await load();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível carregar o calendário.',
        );
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SpecialDateException[]>();
    for (const item of items)
      map.set(item.serviceDate, [...(map.get(item.serviceDate) ?? []), item]);
    return [...map.entries()].sort(([first], [second]) =>
      first.localeCompare(second),
    );
  }, [items]);

  function edit(item: SpecialDateException) {
    setDraft({
      serviceDate: item.serviceDate,
      service: item.service,
      mode: item.mode,
      bookingPaused: item.bookingPaused,
      capacityLimit: item.capacityLimit ? String(item.capacityLimit) : '',
      arrivalTimes: item.arrivalTimes.join(', '),
      customerNotice: item.customerNotice,
    });
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await authorizedFetch('/api/datas-especiais', {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          capacityLimit: draft.capacityLimit
            ? Number(draft.capacityLimit)
            : null,
          arrivalTimes: draft.arrivalTimes
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível salvar a exceção.');
      await load();
      setDraft(emptyDraft());
      setSuccess('Exceção salva e aplicada às novas reservas.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível salvar a exceção.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setSaving(true);
    setError('');
    try {
      const response = await authorizedFetch('/api/datas-especiais', {
        method: 'DELETE',
        body: JSON.stringify(removing),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível remover a exceção.');
      setRemoving(null);
      await load();
      setSuccess('A data voltou a seguir o funcionamento padrão.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível remover a exceção.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-haus-terracotta">
          Administração
        </p>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">
          Calendário de exceções
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black/65">
          Abra ou feche serviços, ajuste a capacidade e comunique horários
          especiais sem alterar o funcionamento dos outros dias.
        </p>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
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

      <Card className="border border-black/10 bg-white shadow-[0_14px_40px_rgba(0,0,0,0.09)]">
        <CardHeader className="border-b border-black/8">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Plus className="size-5 text-haus-terracotta" /> Nova exceção ou
            alteração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="special-date">Data</Label>
              <Input
                id="special-date"
                type="date"
                value={draft.serviceDate}
                onChange={(event) =>
                  setDraft({ ...draft, serviceDate: event.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="special-service">Serviço</Label>
              <NativeSelect
                id="special-service"
                className="w-full"
                value={draft.service}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    service: event.target.value as ServiceType,
                  })
                }
              >
                <NativeSelectOption value="almoco">Almoço</NativeSelectOption>
                <NativeSelectOption value="rodizio">Rodízio</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="special-mode">Funcionamento</Label>
              <NativeSelect
                id="special-mode"
                className="w-full"
                value={draft.mode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    mode: event.target.value as SpecialDateMode,
                  })
                }
              >
                <NativeSelectOption value="open">Aberto</NativeSelectOption>
                <NativeSelectOption value="closed">Fechado</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity-limit">Cota de lugares</Label>
              <Input
                id="capacity-limit"
                type="number"
                min={1}
                max={500}
                value={draft.capacityLimit}
                onChange={(event) =>
                  setDraft({ ...draft, capacityLimit: event.target.value })
                }
                placeholder="70 (deixe vazio para usar o padrão)"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="arrival-times">
                Horários de chegada especiais
              </Label>
              <Input
                id="arrival-times"
                value={draft.arrivalTimes}
                onChange={(event) =>
                  setDraft({ ...draft, arrivalTimes: event.target.value })
                }
                placeholder="18:30, 18:45, 19:00 — vazio usa os horários padrão"
              />
              <p className="text-sm text-black/55">
                Separe os horários por vírgula.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-[#f5f2ee] p-4 md:col-span-2">
              <div>
                <Label htmlFor="booking-paused" className="text-base">
                  Suspender novas reservas
                </Label>
                <p className="mt-1 text-sm text-black/60">
                  Mantém o serviço aberto, mas bloqueia temporariamente novas
                  solicitações.
                </p>
              </div>
              <Switch
                id="booking-paused"
                checked={draft.bookingPaused}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, bookingPaused: checked })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="customer-notice">Aviso mostrado ao cliente</Label>
              <Textarea
                id="customer-notice"
                value={draft.customerNotice}
                onChange={(event) =>
                  setDraft({ ...draft, customerNotice: event.target.value })
                }
                maxLength={240}
                placeholder="Ex.: Nesta data o rodízio terá um horário especial."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(emptyDraft())}
              >
                Limpar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />}{' '}
                Salvar exceção
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="saved-exceptions">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="saved-exceptions"
              className="font-heading text-2xl font-bold"
            >
              Datas configuradas
            </h2>
            <p className="mt-1 text-sm text-black/60">
              Cada serviço pode ter uma regra diferente na mesma data.
            </p>
          </div>
          <Badge variant="outline">{items.length}</Badge>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 rounded-xl bg-white p-6 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Carregando datas...
          </p>
        ) : null}
        {!loading && !grouped.length ? (
          <div className="rounded-2xl border border-dashed border-black/20 bg-white p-10 text-center">
            <CalendarClock className="mx-auto size-8 text-black/35" />
            <p className="mt-3 font-semibold">Nenhuma exceção cadastrada.</p>
            <p className="mt-1 text-sm text-black/55">
              O calendário está seguindo o funcionamento padrão.
            </p>
          </div>
        ) : null}
        {grouped.map(([date, exceptions]) => (
          <Card
            key={date}
            className="border border-black/12 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
          >
            <CardHeader className="border-b border-black/8 bg-[#faf8f5]">
              <CardTitle className="text-lg capitalize">
                {dateLabel(date)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-5 lg:grid-cols-2">
              {exceptions.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl border p-4 ${item.isOpen ? 'border-emerald-200 bg-emerald-50/45' : 'border-red-200 bg-red-50/60'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">
                        {serviceLabel(item.service)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge
                          className={
                            item.isOpen
                              ? 'bg-emerald-700 text-white'
                              : 'bg-red-700 text-white'
                          }
                        >
                          {item.isOpen ? 'Aberto' : 'Fechado'}
                        </Badge>
                        {item.bookingPaused ? (
                          <Badge className="bg-amber-700 text-white">
                            Reservas suspensas
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <CalendarX2
                      className={`size-5 ${item.isOpen ? 'text-emerald-700' : 'text-red-700'}`}
                    />
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div>
                      <dt className="font-semibold text-black/55">Cota</dt>
                      <dd className="font-bold">
                        {item.capacityLimit
                          ? `${item.capacityLimit} lugares`
                          : 'Padrão do sistema'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-black/55">Horários</dt>
                      <dd className="font-bold">
                        {item.arrivalTimes.length
                          ? item.arrivalTimes.join(' · ')
                          : 'Horários padrão'}
                      </dd>
                    </div>
                    {item.customerNotice ? (
                      <div>
                        <dt className="font-semibold text-black/55">
                          Aviso ao cliente
                        </dt>
                        <dd className="leading-5">{item.customerNotice}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-4 flex gap-2 border-t border-black/8 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => edit(item)}
                    >
                      <Pencil /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 /> Remover
                    </Button>
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta exceção?</AlertDialogTitle>
            <AlertDialogDescription>
              O{' '}
              {removing
                ? serviceLabel(removing.service).toLowerCase()
                : 'serviço'}{' '}
              voltará a seguir as regras padrão nesta data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={() => void remove()}
            >
              Remover exceção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
