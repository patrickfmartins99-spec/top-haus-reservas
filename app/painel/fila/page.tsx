'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Check,
  CircleX,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Pencil,
  PhoneCall,
  Plus,
  Save,
  UserRoundX,
  Users,
} from 'lucide-react';

import { ReasonDialog } from '@/components/reason-dialog';
import { WaitlistCallCountdown } from '@/components/waitlist-call-countdown';
import { OfflineModeBanner } from '@/components/offline-mode-banner';
import { Badge } from '@/components/ui/badge';
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
  calledDurationMilliseconds,
  formatDurationClock,
  waitDurationMilliseconds,
} from '@/lib/domain/waitlist-time';
import {
  WAITLIST_EXIT_REASONS,
  WAITLIST_NO_SHOW_REASONS,
} from '@/lib/domain/service-outcomes';
import { getFirebaseClient } from '@/lib/firebase/client';
import { fetchWithTimeout } from '@/lib/client/fetch-with-timeout';
import {
  clearCreationRequestKey,
  creationRequestKey,
} from '@/lib/client/creation-attempt';
import { useStaffEntitySync } from '@/components/use-staff-entity-sync';
import { mergeStaffEntity } from '@/lib/client/staff-events';
import {
  cacheBelongsToToday,
  readStaffCache,
  writeStaffCache,
} from '@/lib/offline/staff-cache';
import { buildWhatsAppUrl, customerMessage } from '@/lib/whatsapp';

type QueueStatus = 'waiting' | 'called' | 'seated' | 'removed' | 'no_show';
type QueueEntry = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  status: QueueStatus;
  revision?: number;
  enteredAt: string | null;
  calledAt: string | null;
};

const statusLabel: Record<QueueStatus, string> = {
  waiting: 'Aguardando',
  called: 'Chamado',
  seated: 'Atendido',
  removed: 'Removido',
  no_show: 'Não compareceu',
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

async function staffRequest(user: User, url: string, init?: RequestInit) {
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  return fetchWithTimeout(url, {
    ...init,
    headers,
  });
}

export default function WaitlistPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mutationInFlight = useRef(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<QueueEntry | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [now, setNow] = useState(() => Date.now());
  const [exitAction, setExitAction] = useState<{
    entry: QueueEntry;
    status: 'removed' | 'no_show';
  } | null>(null);

  useStaffEntitySync({
    scope: currentUser?.uid ?? '',
    ready: Boolean(currentUser) && !loading && !saving && !offlineSavedAt,
    accepts: (event) => event.entityType === 'waitlist',
    load: async (event) => {
      const response = await staffRequest(
        currentUser!,
        `/api/fila?id=${encodeURIComponent(event.entityId)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error('SYNC_FAILED');
      return () =>
        setQueue((current) => {
          const next = mergeStaffEntity(
            current,
            event.entityId,
            data.entries[0] as QueueEntry | undefined,
            (item) => ['waiting', 'called'].includes(item.status),
          ).sort((a, b) =>
            String(a.enteredAt ?? '').localeCompare(String(b.enteredAt ?? '')),
          );
          writeStaffCache('waitlist', next);
          return next;
        });
    },
    onError: () =>
      setError(
        'Não foi possível sincronizar uma alteração da fila. Atualize a página antes de continuar o atendimento.',
      ),
  });

  const loadQueue = useCallback(async (user: User) => {
    const response = await staffRequest(user, '/api/fila?ativas=1');
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? 'Não foi possível carregar a fila.');
    setQueue(data.entries);
    setOfflineSavedAt(null);
    writeStaffCache('waitlist', data.entries);
  }, []);

  async function refreshEntry(id: string) {
    if (!currentUser) return;
    const response = await staffRequest(
      currentUser,
      `/api/fila?id=${encodeURIComponent(id)}`,
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        'A alteração pode ter sido salva, mas a conferência falhou. Atualize a fila antes de repetir a ação.',
      );
    setQueue((current) => {
      const next = mergeStaffEntity(
        current,
        id,
        data.entries[0] as QueueEntry | undefined,
        (item) => ['waiting', 'called'].includes(item.status),
      ).sort((a, b) =>
        String(a.enteredAt ?? '').localeCompare(String(b.enteredAt ?? '')),
      );
      writeStaffCache('waitlist', next);
      return next;
    });
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
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      setCurrentUser(user);
      try {
        await loadQueue(user);
      } catch (caughtError) {
        const cached = readStaffCache<QueueEntry[]>('waitlist');
        if (cached && cacheBelongsToToday(cached.savedAt)) {
          setQueue(cached.value);
          setOfflineSavedAt(cached.savedAt);
          setError('');
        } else {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Não foi possível carregar a fila.',
          );
        }
      } finally {
        setLoading(false);
      }
    });
  }, [loadQueue]);

  async function retryLiveData() {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      await loadQueue(currentUser);
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

  const activeQueue = useMemo(
    () =>
      queue.filter(
        (entry) => entry.status === 'waiting' || entry.status === 'called',
      ),
    [queue],
  );

  function openNewEntry() {
    setEditingEntry(null);
    setCustomerName('');
    setWhatsapp('');
    setPartySize('2');
    setError('');
    setSuccess('');
    setDialogOpen(true);
  }

  function openEditEntry(entry: QueueEntry) {
    setEditingEntry(entry);
    setCustomerName(entry.customerName);
    setWhatsapp(entry.whatsapp);
    setPartySize(String(entry.partySize));
    setError('');
    setSuccess('');
    setDialogOpen(true);
  }

  async function saveEntry(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const input = {
        customerName,
        whatsapp,
        partySize: Number(partySize),
      };
      const requestKey = editingEntry
        ? null
        : await creationRequestKey('staff-waitlist', {
            ...input,
            customerName: customerName.trim(),
            whatsapp: whatsapp.replace(/\D/g, ''),
          });
      const response = await staffRequest(
        currentUser,
        editingEntry ? `/api/fila/${editingEntry.id}` : '/api/fila',
        {
          method: editingEntry ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...input,
            ...(editingEntry
              ? { expectedRevision: editingEntry.revision ?? 0 }
              : { requestKey }),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && editingEntry)
          await refreshEntry(editingEntry.id);
        throw new Error(data.error ?? 'Não foi possível salvar o cliente.');
      }
      const edited = Boolean(editingEntry);
      if (!edited) clearCreationRequestKey('staff-waitlist');
      const savedId = editingEntry?.id ?? data.id;
      setCustomerName('');
      setWhatsapp('');
      setPartySize('2');
      setEditingEntry(null);
      setDialogOpen(false);
      setSuccess(
        edited
          ? 'Dados do cliente atualizados com sucesso.'
          : data.replayed
            ? 'Esta inclusão já havia sido registrada. Confira a fila; para um novo atendimento, use Adicionar à fila novamente.'
            : 'Cliente adicionado à fila. Confira o texto de boas-vindas na aba Mensagens.',
      );
      await refreshEntry(savedId);
    } catch (caughtError) {
      setError(
        caughtError instanceof TypeError
          ? 'A conexão falhou. O cliente pode ter sido incluído. Tente novamente com os mesmos dados para conferir.'
          : caughtError instanceof Error
            ? caughtError.message
            : 'Não foi possível salvar o cliente.',
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  const waitingQueue = activeQueue.filter(
    (entry) => entry.status === 'waiting',
  );
  const calledQueue = activeQueue.filter((entry) => entry.status === 'called');
  const longestWait = waitingQueue.length
    ? Math.max(
        ...waitingQueue.map(
          (entry) => waitDurationMilliseconds(entry, now) ?? 0,
        ),
      )
    : null;

  async function updateStatus(
    entry: QueueEntry,
    status: QueueStatus,
    reason = '',
    note = '',
  ) {
    if (!currentUser || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await staffRequest(
        currentUser,
        `/api/fila/${entry.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            reason,
            note,
            expectedRevision: entry.revision ?? 0,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setExitAction(null);
          await refreshEntry(entry.id);
        }
        throw new Error(data.error ?? 'Não foi possível atualizar a fila.');
      }
      setExitAction(null);
      setSuccess(
        status === 'called'
          ? `${entry.customerName} foi marcado como chamado. Confira e envie a mensagem na aba Mensagens.`
          : status === 'seated'
            ? `Chegada de ${entry.customerName} confirmada. O atendimento saiu da fila ativa.`
            : status === 'no_show'
              ? `${entry.customerName} foi registrado como no show.`
              : `${entry.customerName} saiu da fila. Motivo registrado no relatório.`,
      );
      await refreshEntry(entry.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível atualizar a fila.',
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">
            Atendimento sem reserva
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
            Fila de espera
          </h1>
          <p className="mt-1 text-sm text-black/65">
            Registre os dados do cliente e acompanhe a ordem de atendimento.
          </p>
        </div>
        <Button
          className="h-11 w-full bg-black text-white hover:bg-black/85 sm:w-auto"
          disabled={Boolean(offlineSavedAt)}
          onClick={openNewEntry}
        >
          <Plus /> Adicionar à fila
        </Button>
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
        <output className="block rounded-xl bg-black px-4 py-3 text-sm font-medium text-white">
          {success}
        </output>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {[
          { label: 'Aguardando', value: waitingQueue.length, icon: Clock3 },
          { label: 'Chamados', value: calledQueue.length, icon: PhoneCall },
          {
            label: 'Pessoas na fila',
            value: activeQueue.reduce((sum, item) => sum + item.partySize, 0),
            icon: Users,
          },
          {
            label: 'Maior espera atual',
            value:
              longestWait === null ? '—' : formatDurationClock(longestWait),
            icon: MessageCircle,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card
            key={label}
            className="bg-white shadow-[0_8px_24px_rgba(0,0,0,0.07)] ring-black/7"
          >
            <CardContent className="flex items-center justify-between gap-2 p-3 sm:p-6">
              <div>
                <p className="text-xs font-medium text-black/70 sm:text-sm">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-extrabold sm:mt-2">{value}</p>
              </div>
              <span className="hidden size-10 place-items-center rounded-xl bg-[#eadcd2] text-haus-terracotta sm:grid">
                <Icon />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white ring-black/7">
        <CardHeader className="border-b border-black/7">
          <CardTitle>Ordem de atendimento</CardTitle>
          <p className="text-sm text-black/65">
            {offlineSavedAt
              ? 'Exibindo a última cópia deste aparelho; a situação pode ter mudado em outros dispositivos.'
              : 'Dados salvos no Firebase e compartilhados com toda a equipe.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-black/65">
              <LoaderCircle className="size-4 animate-spin" /> Carregando
              fila...
            </p>
          ) : null}
          {!loading && activeQueue.length === 0 ? (
            <p className="py-10 text-center text-sm text-black/65">
              Nenhum cliente aguardando no momento.
            </p>
          ) : null}
          {activeQueue.map((entry, index) => {
            const whatsappUrl = buildWhatsAppUrl(
              entry.whatsapp,
              customerMessage(
                entry.status === 'called'
                  ? 'waitlist_called'
                  : 'waitlist_created',
                entry,
              ),
            );
            const waitTime = formatDurationClock(
              waitDurationMilliseconds(entry, now),
            );
            const calledTime = calledDurationMilliseconds(entry, now);
            return (
              <article
                key={entry.id}
                className={`flex flex-col gap-4 rounded-xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center ${entry.status === 'called' ? 'border-haus-terracotta/35 bg-[#f4e7d7]' : 'border-black/10 bg-white'}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{entry.customerName}</p>
                    <Badge
                      className={
                        entry.status === 'called'
                          ? 'bg-haus-terracotta text-white'
                          : 'bg-[#e7e1db] text-[#4f3528]'
                      }
                    >
                      {statusLabel[entry.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-black/75">
                    {entry.partySize} pessoas · {formatPhone(entry.whatsapp)}
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold text-black">
                    {entry.status === 'called'
                      ? `Aguardou ${waitTime}${calledTime === null ? '' : ` · chamado há ${formatDurationClock(calledTime)}`}`
                      : `Aguardando há ${waitTime}`}
                  </p>
                  <WaitlistCallCountdown entry={entry} now={now} />
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:[&>*]:min-w-[7.5rem]">
                  {entry.status === 'waiting' ? (
                    <Button
                      disabled={saving || Boolean(offlineSavedAt)}
                      onClick={() => updateStatus(entry, 'called')}
                      className="col-span-2 min-h-11 bg-haus-terracotta text-white hover:bg-haus-terracotta/90 sm:col-span-1"
                    >
                      <PhoneCall /> Chamar
                    </Button>
                  ) : null}
                  {entry.status === 'called' ? (
                    <Button
                      disabled={saving || Boolean(offlineSavedAt)}
                      onClick={() => updateStatus(entry, 'seated')}
                      className="col-span-2 min-h-11 bg-black text-white hover:bg-black/85 sm:col-span-1"
                    >
                      <Check /> Confirmar chegada
                    </Button>
                  ) : null}
                  {whatsappUrl ? (
                    <a
                      href="/painel/mensagens"
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        variant: 'outline',
                        className:
                          'border-haus-terracotta/30 text-haus-terracotta',
                      })}
                    >
                      <MessageCircle /> WhatsApp
                    </a>
                  ) : null}
                  <Button
                    disabled={saving || Boolean(offlineSavedAt)}
                    variant="outline"
                    onClick={() => openEditEntry(entry)}
                  >
                    <Pencil /> Editar
                  </Button>
                  <Button
                    disabled={saving || Boolean(offlineSavedAt)}
                    variant="outline"
                    onClick={() => setExitAction({ entry, status: 'removed' })}
                  >
                    <UserRoundX /> Cliente saiu da fila
                  </Button>
                  {entry.status === 'called' ? (
                    <Button
                      disabled={saving || Boolean(offlineSavedAt)}
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() =>
                        setExitAction({ entry, status: 'no_show' })
                      }
                    >
                      <CircleX /> No show
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-black/65">
        WhatsApp assistido: confira a mensagem pronta antes de enviar ao
        cliente.
      </p>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={saveEntry}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingEntry
                  ? 'Editar cliente da fila'
                  : 'Adicionar cliente à fila'}
              </DialogTitle>
              <DialogDescription className="text-black/65">
                {editingEntry
                  ? 'As alterações ficarão registradas na auditoria.'
                  : 'Informe os dados necessários para identificar e avisar o cliente.'}
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="queue-name">Nome do cliente</Label>
                <Input
                  id="queue-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  minLength={2}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="queue-whatsapp">WhatsApp</Label>
                <Input
                  id="queue-whatsapp"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="(47) 99999-9999"
                  inputMode="tel"
                  minLength={10}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="queue-party">Pessoas</Label>
                <Input
                  id="queue-party"
                  type="number"
                  value={partySize}
                  onChange={(event) => setPartySize(event.target.value)}
                  min={1}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || Boolean(offlineSavedAt)}
                className="bg-black text-white hover:bg-black/85"
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" />
                ) : editingEntry ? (
                  <Save />
                ) : (
                  <Plus />
                )}{' '}
                {editingEntry ? 'Salvar alterações' : 'Adicionar cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        key={
          exitAction
            ? `${exitAction.entry.id}-${exitAction.status}`
            : 'no-waitlist-entry'
        }
        open={exitAction !== null}
        title={
          exitAction?.status === 'no_show'
            ? `Registrar no show de ${exitAction.entry.customerName}?`
            : `Retirar ${exitAction?.entry.customerName ?? ''} da fila?`
        }
        description="O atendimento sairá da fila ativa. O motivo, o horário e o responsável ficarão registrados nos relatórios."
        options={
          exitAction?.status === 'no_show'
            ? WAITLIST_NO_SHOW_REASONS
            : WAITLIST_EXIT_REASONS
        }
        confirmLabel={
          exitAction?.status === 'no_show'
            ? 'Registrar no show'
            : 'Confirmar saída'
        }
        busy={saving}
        onOpenChange={(open) => !open && setExitAction(null)}
        onConfirm={(reason, note) =>
          exitAction
            ? updateStatus(exitAction.entry, exitAction.status, reason, note)
            : undefined
        }
      />
    </div>
  );
}
