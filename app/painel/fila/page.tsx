'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Check, Clock3, LoaderCircle, MessageCircle, PhoneCall, Plus, UserRoundX, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getFirebaseClient } from '@/lib/firebase/client';

type QueueStatus = 'waiting' | 'called' | 'seated' | 'removed';
type QueueEntry = {
  id: string;
  customerName: string;
  whatsapp: string;
  partySize: number;
  seatingPreference: string;
  estimatedMinutes: number;
  status: QueueStatus;
  enteredAt: string | null;
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [estimatedMinutes, setEstimatedMinutes] = useState('15');
  const [seatingPreference, setSeatingPreference] = useState('sem_preferencia');

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

  const activeQueue = useMemo(() => queue.filter((entry) => entry.status === 'waiting' || entry.status === 'called'), [queue]);

  async function addEntry(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const response = await staffRequest(currentUser, '/api/fila', {
        method: 'POST',
        body: JSON.stringify({ customerName, whatsapp, partySize: Number(partySize), estimatedMinutes: Number(estimatedMinutes), seatingPreference }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível adicionar o cliente.');
      setCustomerName(''); setWhatsapp(''); setPartySize('2'); setEstimatedMinutes('15'); setSeatingPreference('sem_preferencia');
      setDialogOpen(false);
      setSuccess('Cliente adicionado à fila. O WhatsApp ficou registrado para a notificação.');
      await loadQueue(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível adicionar o cliente.');
    } finally { setSaving(false); }
  }

  async function updateStatus(entry: QueueEntry, status: QueueStatus) {
    if (!currentUser) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const response = await staffRequest(currentUser, `/api/fila/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível atualizar a fila.');
      setSuccess(status === 'called' ? `${entry.customerName} foi marcado como chamado. A mensagem será enviada quando o WhatsApp estiver conectado.` : 'Fila atualizada com sucesso.');
      await loadQueue(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível atualizar a fila.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento sem reserva</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Fila de espera</h1><p className="mt-1 text-sm text-black/55">Registre os dados do cliente e acompanhe a ordem de atendimento.</p></div><Button className="bg-black text-white hover:bg-black/85" onClick={() => { setDialogOpen(true); setError(''); }}><Plus /> Adicionar à fila</Button></div>

      <div className="rounded-xl border border-haus-gold/35 bg-[#f4e7d7] px-4 py-3 text-sm text-black/65"><strong>WhatsApp:</strong> o número já é obrigatório e fica salvo. O envio automático será ativado quando conectarmos o provedor de mensagens.</div>
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      {success ? <output className="block rounded-xl bg-black px-4 py-3 text-sm font-medium text-white">{success}</output> : null}

      <div className="grid gap-4 sm:grid-cols-3">{[
        { label: 'Aguardando', value: activeQueue.filter((item) => item.status === 'waiting').length, icon: Clock3 },
        { label: 'Pessoas na fila', value: activeQueue.reduce((sum, item) => sum + item.partySize, 0), icon: Users },
        { label: 'Tempo estimado', value: activeQueue.length ? `${Math.max(...activeQueue.map((item) => item.estimatedMinutes))} min` : '—', icon: MessageCircle },
      ].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white ring-black/7"><CardContent className="flex items-center justify-between"><div><p className="text-sm text-black/50">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></div><span className="grid size-10 place-items-center rounded-xl bg-[#eadcd2] text-haus-terracotta"><Icon /></span></CardContent></Card>)}</div>

      <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle>Ordem de atendimento</CardTitle><p className="text-sm text-black/50">Dados salvos no Firebase e compartilhados com toda a equipe.</p></CardHeader><CardContent className="space-y-3">
        {loading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-black/50"><LoaderCircle className="size-4 animate-spin" /> Carregando fila...</p> : null}
        {!loading && activeQueue.length === 0 ? <p className="py-10 text-center text-sm text-black/50">Nenhum cliente aguardando no momento.</p> : null}
        {activeQueue.map((entry, index) => <article key={entry.id} className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${entry.status === 'called' ? 'border-haus-terracotta/35 bg-[#f4e7d7]' : 'border-black/8'}`}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{entry.customerName}</p><Badge className={entry.status === 'called' ? 'bg-haus-terracotta text-white' : 'bg-[#e7e1db] text-[#4f3528]'}>{statusLabel[entry.status]}</Badge></div><p className="mt-1 text-sm text-black/50">{entry.partySize} pessoas · {entry.estimatedMinutes} min · {formatPhone(entry.whatsapp)}</p></div><div className="flex flex-wrap gap-2">{entry.status === 'waiting' ? <Button disabled={saving} onClick={() => updateStatus(entry, 'called')} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><PhoneCall /> Chamar</Button> : null}{entry.status === 'called' ? <Button disabled={saving} onClick={() => updateStatus(entry, 'seated')} className="bg-black text-white hover:bg-black/85"><Check /> Marcar atendido</Button> : null}<Button disabled={saving} variant="outline" onClick={() => updateStatus(entry, 'removed')}><UserRoundX /> Remover</Button></div></article>)}
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={addEntry}>
            <DialogHeader><DialogTitle className="text-xl font-bold">Adicionar cliente à fila</DialogTitle><DialogDescription>Informe os dados necessários para identificar e avisar o cliente.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-name">Nome do cliente</Label><Input id="queue-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} minLength={2} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-whatsapp">WhatsApp</Label><Input id="queue-whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(47) 99999-9999" inputMode="tel" minLength={10} required /></div>
              <div className="space-y-2"><Label htmlFor="queue-party">Pessoas</Label><Input id="queue-party" type="number" value={partySize} onChange={(event) => setPartySize(event.target.value)} min={1} required /></div>
              <div className="space-y-2"><Label htmlFor="queue-estimate">Estimativa (min)</Label><Input id="queue-estimate" type="number" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} min={1} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="queue-preference">Preferência</Label><NativeSelect id="queue-preference" value={seatingPreference} onChange={(event) => setSeatingPreference(event.target.value)} className="w-full"><NativeSelectOption value="sem_preferencia">Sem preferência</NativeSelectOption><NativeSelectOption value="sofa">Sofá lateral</NativeSelectOption><NativeSelectOption value="parede_vidro">Parede de vidro</NativeSelectOption><NativeSelectOption value="parede_tomada">Parede com tomada</NativeSelectOption></NativeSelect></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-black text-white hover:bg-black/85">{saving ? <LoaderCircle className="animate-spin" /> : <Plus />} Adicionar cliente</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
