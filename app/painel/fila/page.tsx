'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Check, Clock3, LoaderCircle, MessageCircle, Pencil, PhoneCall, Plus, Save, UserRoundX, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calledDurationMilliseconds, formatDurationClock, waitDurationMilliseconds } from '@/lib/domain/waitlist-time';
import { getFirebaseClient } from '@/lib/firebase/client';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

type QueueStatus = 'waiting' | 'called' | 'seated' | 'removed';
type QueueEntry = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  status: QueueStatus;
  enteredAt: string | null;
  calledAt: string | null;
};

const statusLabel: Record<QueueStatus, string> = {
  waiting: 'Aguardando',
  called: 'Chamado',
  seated: 'Atendido',
  removed: 'Removido',
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

async function staffRequest(user: User, url: string, init?: RequestInit) {
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, {
    ...init,
    headers,
  });
}

export default function WaitlistPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<QueueEntry | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [now, setNow] = useState(() => Date.now());

  const loadQueue = useCallback(async (user: User) => {
    const response = await staffRequest(user, '/api/fila');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar a fila.');
    setQueue(data.entries);
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
      try { await loadQueue(user); }
      catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível carregar a fila.'); }
      finally { setLoading(false); }
    });
  }, [loadQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeQueue = useMemo(() => queue.filter((entry) => entry.status === 'waiting' || entry.status === 'called'), [queue]);

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
    if (!currentUser) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const response = await staffRequest(currentUser, editingEntry ? `/api/fila/${editingEntry.id}` : '/api/fila', {
        method: editingEntry ? 'PATCH' : 'POST',
        body: JSON.stringify({ customerName, whatsapp, partySize: Number(partySize) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar o cliente.');
      const edited = Boolean(editingEntry);
      setCustomerName(''); setWhatsapp(''); setPartySize('2');
      setEditingEntry(null);
      setDialogOpen(false);
      setSuccess(edited ? 'Dados do cliente atualizados com sucesso.' : 'Cliente adicionado à fila. O WhatsApp ficou registrado para a notificação.');
      await loadQueue(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível salvar o cliente.');
    } finally { setSaving(false); }
  }

  const waitingQueue = activeQueue.filter((entry) => entry.status === 'waiting');
  const calledQueue = activeQueue.filter((entry) => entry.status === 'called');
  const longestWait = waitingQueue.length
    ? Math.max(...waitingQueue.map((entry) => waitDurationMilliseconds(entry, now) ?? 0))
    : null;

  async function updateStatus(entry: QueueEntry, status: QueueStatus) {
    if (!currentUser) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const response = await staffRequest(currentUser, `/api/fila/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível atualizar a fila.');
      setSuccess(status === 'called' ? `${entry.customerName} foi marcado como chamado. Use o botão WhatsApp para enviar a mensagem pronta.` : 'Fila atualizada com sucesso.');
      await loadQueue(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível atualizar a fila.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento sem reserva</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Fila de espera</h1><p className="mt-1 text-sm text-black/65">Registre os dados do cliente e acompanhe a ordem de atendimento.</p></div><Button className="bg-black text-white hover:bg-black/85" onClick={openNewEntry}><Plus /> Adicionar à fila</Button></div>

      <div className="rounded-xl border border-haus-gold/45 bg-[#f4e7d7] px-4 py-3 text-sm text-black/75"><strong>WhatsApp assistido:</strong> o sistema abre a conversa com a mensagem pronta; o colaborador confere e envia pelo WhatsApp Business.</div>
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      {success ? <output className="block rounded-xl bg-black px-4 py-3 text-sm font-medium text-white">{success}</output> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Aguardando', value: waitingQueue.length, icon: Clock3 },
        { label: 'Chamados', value: calledQueue.length, icon: PhoneCall },
        { label: 'Pessoas na fila', value: activeQueue.reduce((sum, item) => sum + item.partySize, 0), icon: Users },
        { label: 'Maior espera atual', value: longestWait === null ? '—' : formatDurationClock(longestWait), icon: MessageCircle },
      ].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white ring-black/7"><CardContent className="flex items-center justify-between"><div><p className="text-sm text-black/65">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></div><span className="grid size-10 place-items-center rounded-xl bg-[#eadcd2] text-haus-terracotta"><Icon /></span></CardContent></Card>)}</div>

      <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle>Ordem de atendimento</CardTitle><p className="text-sm text-black/65">Dados salvos no Firebase e compartilhados com toda a equipe.</p></CardHeader><CardContent className="space-y-3">
        {loading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-black/65"><LoaderCircle className="size-4 animate-spin" /> Carregando fila...</p> : null}
        {!loading && activeQueue.length === 0 ? <p className="py-10 text-center text-sm text-black/65">Nenhum cliente aguardando no momento.</p> : null}
        {activeQueue.map((entry, index) => {
          const whatsappUrl = buildWhatsAppUrl(entry.whatsapp, `Olá, ${entry.customerName}! Sua mesa no Top Haus está disponível. Por favor, dirija-se à recepção. A mesa será mantida por 10 minutos.`);
          const waitTime = formatDurationClock(waitDurationMilliseconds(entry, now));
          const calledTime = calledDurationMilliseconds(entry, now);
          return <article key={entry.id} className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${entry.status === 'called' ? 'border-haus-terracotta/35 bg-[#f4e7d7]' : 'border-black/8'}`}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{entry.customerName}</p><Badge className={entry.status === 'called' ? 'bg-haus-terracotta text-white' : 'bg-[#e7e1db] text-[#4f3528]'}>{statusLabel[entry.status]}</Badge></div><p className="mt-1 text-sm font-medium text-black/75">{entry.partySize} pessoas · {formatPhone(entry.whatsapp)}</p><p className="mt-1 font-mono text-sm font-bold text-black">{entry.status === 'called' ? `Aguardou ${waitTime}${calledTime === null ? '' : ` · chamado há ${formatDurationClock(calledTime)}`}` : `Aguardando há ${waitTime}`}</p></div><div className="flex flex-wrap gap-2"><Button disabled={saving} variant="outline" onClick={() => openEditEntry(entry)}><Pencil /> Editar</Button>{entry.status === 'waiting' ? <Button disabled={saving} onClick={() => updateStatus(entry, 'called')} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><PhoneCall /> Chamar</Button> : null}{entry.status === 'called' && whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', className: 'border-haus-terracotta/30 text-haus-terracotta' })}><MessageCircle /> WhatsApp</a> : null}{entry.status === 'called' ? <Button disabled={saving} onClick={() => updateStatus(entry, 'seated')} className="bg-black text-white hover:bg-black/85"><Check /> Marcar atendido</Button> : null}<Button disabled={saving} variant="outline" onClick={() => updateStatus(entry, 'removed')}><UserRoundX /> Remover</Button></div></article>;
        })}
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEntry(null); }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={saveEntry}>
            <DialogHeader><DialogTitle className="text-xl font-bold">{editingEntry ? 'Editar cliente da fila' : 'Adicionar cliente à fila'}</DialogTitle><DialogDescription className="text-black/65">{editingEntry ? 'As alterações ficarão registradas na auditoria.' : 'Informe os dados necessários para identificar e avisar o cliente.'}</DialogDescription></DialogHeader>
            {error ? <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-name">Nome do cliente</Label><Input id="queue-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} minLength={2} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-whatsapp">WhatsApp</Label><Input id="queue-whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(47) 99999-9999" inputMode="tel" minLength={10} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-party">Pessoas</Label><Input id="queue-party" type="number" value={partySize} onChange={(event) => setPartySize(event.target.value)} min={1} required /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-black text-white hover:bg-black/85">{saving ? <LoaderCircle className="animate-spin" /> : editingEntry ? <Save /> : <Plus />} {editingEntry ? 'Salvar alterações' : 'Adicionar cliente'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
