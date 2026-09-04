'use client';
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { MessageCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MessageText } from '@/components/message-text';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getFirebaseClient } from '@/lib/firebase/client';
import { buildWhatsAppUrl, customerMessage, messageTitles } from '@/lib/whatsapp';

type Message = { id: string; title: string; customerName: string; whatsapp: string; message: string; warning: string; createdAt: string };
const example = { customerName: 'Mariana', serviceDate: '2026-12-12', arrivalTime: '19:00', partySize: 4, service: 'rodizio', reservationCode: 'EXEMPLO-123', previous: { customerName: 'Mariana', serviceDate: '2026-12-12', arrivalTime: '18:30', partySize: 2, service: 'rodizio' } };
export default function MessagesPage() {
  const [items, setItems] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Message | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState('reservation_confirmed');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const user = getFirebaseClient()?.auth.currentUser; if (!user) return;
    try { const response = await fetch('/api/mensagens', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setItems(data.items); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível carregar.'); }
  }, []);
  useEffect(() => {
    const firebase = getFirebaseClient(); if (!firebase) return;
    const unsubscribe = onAuthStateChanged(firebase.auth, () => { void refresh(); });
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15_000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [refresh]);
  async function finish(item: Message, nextStatus: string) {
    const user = getFirebaseClient()?.auth.currentUser; if (!user) return;
    if (!window.confirm(nextStatus === 'manual_sent' ? 'Você já enviou esta mensagem no WhatsApp? O sistema registrará sua confirmação, sem verificar a entrega.' : 'Descartar esta mensagem da lista de pendências?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/mensagens', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ id: item.id, status: nextStatus }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSelected(null); await refresh(); setStatus(nextStatus === 'manual_sent' ? 'Envio manual registrado em seu nome.' : 'Mensagem descartada.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível registrar.'); } finally { setBusy(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setStatus('Texto copiado.'); } catch { setError('Não foi possível copiar. Selecione o texto e copie manualmente.'); } }
  const current = selected ? items.find((item) => item.id === selected.id) : null;
  return <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-extrabold">Mensagens</h1><p className="mt-2 text-black/75">Confira, personalize e envie pelo WhatsApp. Nenhum envio é automático.</p></div><Button variant="outline" onClick={() => void refresh()}><RefreshCw/> Atualizar</Button></div>
    <p className="rounded-xl bg-[#f4e7d7] p-4 text-sm leading-6">Abrir o WhatsApp ou copiar o texto não significa que a mensagem foi enviada. Depois do envio, use “Já enviei” para registrar quem fez o atendimento. A contagem de três minutos da fila começa quando o cliente é marcado como chamado.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{status && <output className="block font-semibold">{status}</output>}
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/10"><h2 className="mb-4 text-xl font-bold">Aguardando atendimento ({items.length})</h2>{!items.length && <p className="text-black/70">Nenhuma mensagem nova aguardando envio manual.</p>}<div className="space-y-3">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/15 p-4"><div><p className="font-bold">{item.customerName} · {item.title}</p><p className="text-sm text-black/70">{item.whatsapp} · {new Date(item.createdAt).toLocaleString('pt-BR')}</p>{item.warning && <p className="mt-2 max-w-lg text-sm font-semibold text-red-700">{item.warning}</p>}</div><div className="flex gap-2"><Button variant="outline" disabled={Boolean(item.warning)} onClick={() => { setSelected(item); setDraft(item.message); }}>Conferir mensagem</Button><Button variant="ghost" disabled={busy} onClick={() => finish(item, 'ignored')}>Descartar</Button></div></article>)}</div></section>
    <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/10"><h2 className="text-xl font-bold">Modelos por ação</h2><p className="text-sm text-black/70">Prévia com dados fictícios para revisarmos os textos juntos. Não cria reserva nem envia mensagens.</p><NativeSelect aria-label="Escolher modelo de mensagem" value={model} onChange={(e) => setModel(e.target.value)} className="w-full">{Object.entries(messageTitles).map(([key, title]) => <NativeSelectOption key={key} value={key}>{key.startsWith('waitlist') ? 'Fila' : 'Reserva'} — {title}</NativeSelectOption>)}</NativeSelect><p className="whitespace-pre-wrap rounded-xl bg-[#faf7f3] p-5 text-sm leading-7"><MessageText text={customerMessage(model, example)}/></p><Button variant="outline" onClick={() => copy(customerMessage(model, example))}><Copy/> Copiar modelo</Button></section>
    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Confira o destinatário: {selected?.customerName} · {selected?.whatsapp}. Você pode ajustar o texto deste atendimento antes de enviar.</DialogDescription></DialogHeader><Textarea aria-label="Texto da mensagem" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10}/><p className="text-xs text-black/70">Use *asteriscos* para destacar informações em negrito no WhatsApp.</p><div className="whitespace-pre-wrap rounded-xl bg-[#faf7f3] p-4 text-sm leading-6" aria-label="Prévia da mensagem"><MessageText text={draft}/></div>{current?.warning && <p className="text-red-700">{current.warning}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(draft)}><Copy/> Copiar</Button>{selected && current && !current.warning && buildWhatsAppUrl(selected.whatsapp, draft) && <a className={buttonVariants({ className: 'bg-black text-white' })} href={buildWhatsAppUrl(selected.whatsapp, draft)} target="_blank" rel="noreferrer"><MessageCircle/> Abrir WhatsApp</a>}{selected && <Button disabled={busy || !current || Boolean(current.warning)} variant="outline" onClick={() => finish(selected, 'manual_sent')}><Check/> Já enviei</Button>}</div></DialogContent></Dialog>
  </div>;
}
