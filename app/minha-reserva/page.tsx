'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, LoaderCircle, MessageCircle, Pencil, Save, Search, Trash2, Users } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

type Reservation = {
  id: string; customerName: string; whatsapp: string; partySize: number; service: string; serviceDate: string;
  arrivalTime: string; seatingPreference: string; notes: string; status: string; canModify: boolean;
  modifyDeadline: string; lateToleranceMinutes: number; restaurantWhatsapp: string;
};

const times: Record<string, string[]> = { almoco: ['11:00', '11:15', '11:30'], rodizio: ['18:30', '18:45', '19:00'] };
const statusLabels: Record<string, string> = { pending_approval: 'Aguardando aprovação', confirmed: 'Confirmada', presence_confirmed: 'Presença confirmada', cancelled: 'Cancelada', seated: 'Cliente chegou', no_show: 'Não compareceu', completed: 'Concluída' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

export default function MinhaReservaPage() {
  const [code, setCode] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [draft, setDraft] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    const queryCode = new URLSearchParams(window.location.search).get('codigo');
    if (!queryCode) return;
    const timeout = window.setTimeout(() => setCode(queryCode), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function request(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setLoading(true); setError(''); setSuccess('');
    try {
      const response = await fetch('/api/minha-reserva', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir a solicitação.');
      setReservation(data.reservation);
      return data.reservation as Reservation;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível concluir a solicitação.');
      return null;
    } finally { setLoading(false); }
  }

  async function findReservation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await request('POST', { code: code.trim(), whatsapp });
  }

  async function confirmPresence() {
    const updated = await request('PATCH', { code: reservation?.id, whatsapp, action: 'confirm_presence' });
    if (updated) setSuccess('Presença confirmada. Nos vemos em breve!');
  }

  async function cancelReservation() {
    const updated = await request('PATCH', { code: reservation?.id, whatsapp, action: 'cancel' });
    if (updated) { setCancelOpen(false); setSuccess('Reserva cancelada com sucesso.'); }
  }

  async function saveReservation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const updated = await request('PATCH', { code: reservation?.id, whatsapp, action: 'update', reservation: draft });
    if (updated) { setDraft(null); setSuccess(updated.status === 'pending_approval' ? 'Alteração enviada e aguardando aprovação da equipe.' : 'Reserva alterada e confirmada.'); }
  }

  const supportUrl = reservation ? buildWhatsAppUrl(reservation.restaurantWhatsapp, `Olá! Preciso de atendimento sobre a reserva ${reservation.id}.`) : '';

  return (
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <header className="border-b border-white/10 bg-black text-white"><div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8"><Link href="/" aria-label="Top Haus — página inicial"><BrandLogo compact priority className="rounded-md" /></Link><Link href="/" className="flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-white"><ArrowLeft className="size-4" /> Voltar para reservas</Link></div></header>
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:py-16">
        <div className="max-w-md pt-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-haus-terracotta">Área do cliente</p><h1 className="mt-3 text-4xl font-extrabold tracking-[-0.035em]">Acompanhe sua reserva.</h1><p className="mt-4 leading-7 text-black/65">Consulte os dados reais, confirme a presença, altere ou cancele dentro do prazo.</p><div className="mt-8 space-y-4 text-sm text-black/65"><p className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white"><MessageCircle className="size-4 text-haus-terracotta" /></span> Use o mesmo WhatsApp informado na reserva.</p><p className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white"><Clock3 className="size-4 text-haus-terracotta" /></span> Fora do prazo, a equipe atende pelo WhatsApp.</p></div></div>
        <Card className="border-0 bg-[#fdfcf9] py-0 shadow-[0_24px_70px_rgba(0,0,0,0.12)] ring-black/5"><CardContent className="p-6 sm:p-8">
          {error ? <p className="mb-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
          {success ? <output className="mb-5 block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">{success}</output> : null}
          {!reservation ? <form onSubmit={findReservation} className="space-y-5"><div><h2 className="text-2xl font-bold tracking-tight">Localizar reserva</h2><p className="mt-1 text-sm text-black/60">Informe o código recebido ao reservar e o WhatsApp cadastrado.</p></div><div className="space-y-2"><Label htmlFor="reservation-code">Código da reserva</Label><Input id="reservation-code" value={code} onChange={(event) => setCode(event.target.value)} className="h-12 bg-white" placeholder="Cole o código da reserva" required /></div><div className="space-y-2"><Label htmlFor="reservation-whatsapp">WhatsApp</Label><Input id="reservation-whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="h-12 bg-white" placeholder="(00) 00000-0000" inputMode="tel" required /></div><Button type="submit" disabled={loading} className="h-12 w-full bg-haus-terracotta text-base font-bold text-white hover:bg-haus-terracotta/90">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <Search className="size-5" />} Consultar reserva</Button></form> :
          <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/8 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Reserva {reservation.id}</p><h2 className="mt-2 text-2xl font-bold">{reservation.service === 'almoco' ? 'Almoço' : 'Rodízio'} no Top Haus</h2><p className="mt-1 text-sm font-medium text-black/65">Em nome de {reservation.customerName}</p></div><span className="rounded-full bg-[#eadcd2] px-3 py-1.5 text-xs font-bold text-[#653b25]">{statusLabels[reservation.status] ?? reservation.status}</span></div>
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><CalendarDays className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs font-medium text-black/60">Data</p><p className="mt-1 font-bold capitalize">{formatDate(reservation.serviceDate)}</p></div><div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><Clock3 className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs font-medium text-black/60">Chegada</p><p className="mt-1 font-bold">{reservation.arrivalTime}</p></div><div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><Users className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs font-medium text-black/60">Pessoas</p><p className="mt-1 font-bold">{reservation.partySize}</p></div></div>
            <div className="rounded-2xl border border-haus-gold/40 bg-[#f4e7d7] p-4 text-sm leading-6 text-black/75">A mesa será mantida por {reservation.lateToleranceMinutes} minutos após o horário de chegada. Crianças e bebês devem estar incluídos na quantidade.</div>
            {reservation.status === 'confirmed' ? <Button type="button" disabled={loading} onClick={confirmPresence} className="h-12 w-full bg-black text-base font-bold text-white hover:bg-black/85"><CheckCircle2 /> Confirmar presença</Button> : null}
            <div className="grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" className="h-11" onClick={() => { setReservation(null); setSuccess(''); setError(''); }}>Consultar outra reserva</Button>{reservation.canModify ? <Button type="button" variant="outline" className="h-11" onClick={() => setDraft({ ...reservation })}><Pencil /> Alterar reserva</Button> : supportUrl ? <a href={supportUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', className: 'h-11 border-haus-terracotta/30 text-haus-terracotta' })}><MessageCircle /> Falar no WhatsApp</a> : <Button type="button" disabled variant="outline" className="h-11">Prazo de alteração encerrado</Button>}</div>
            {reservation.canModify && !['cancelled', 'completed', 'no_show', 'seated'].includes(reservation.status) ? <Button type="button" variant="destructive" className="w-full" onClick={() => setCancelOpen(true)}><Trash2 /> Cancelar reserva</Button> : null}
          </div>}
        </CardContent></Card>
      </section>

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">{draft ? <form onSubmit={saveReservation}><DialogHeader><DialogTitle>Alterar reserva</DialogTitle><DialogDescription>As alterações ficam registradas e podem exigir nova aprovação.</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="client-name">Nome</Label><Input id="client-name" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="client-party">Pessoas</Label><Input id="client-party" type="number" min={1} value={draft.partySize} onChange={(event) => setDraft({ ...draft, partySize: Number(event.target.value) })} required /></div><div className="space-y-2"><Label htmlFor="client-date">Data</Label><Input id="client-date" type="date" value={draft.serviceDate} onChange={(event) => setDraft({ ...draft, serviceDate: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="client-service">Serviço</Label><NativeSelect id="client-service" value={draft.service} onChange={(event) => { const service = event.target.value; setDraft({ ...draft, service, arrivalTime: times[service][0] }); }} className="w-full"><NativeSelectOption value="almoco">Almoço</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio</NativeSelectOption></NativeSelect></div><div className="space-y-2"><Label htmlFor="client-time">Horário</Label><NativeSelect id="client-time" value={draft.arrivalTime} onChange={(event) => setDraft({ ...draft, arrivalTime: event.target.value })} className="w-full">{times[draft.service].map((time) => <NativeSelectOption key={time} value={time}>{time}</NativeSelectOption>)}</NativeSelect></div><div className="space-y-2"><Label htmlFor="client-preference">Preferência</Label><NativeSelect id="client-preference" value={draft.seatingPreference} onChange={(event) => setDraft({ ...draft, seatingPreference: event.target.value })} className="w-full"><NativeSelectOption value="sem_preferencia">Sem preferência</NativeSelectOption><NativeSelectOption value="sofa">Sofá lateral</NativeSelectOption><NativeSelectOption value="parede_vidro">Parede de vidro</NativeSelectOption><NativeSelectOption value="parede_tomada">Parede com tomada</NativeSelectOption></NativeSelect></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="client-notes">Observações</Label><Textarea id="client-notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} maxLength={1000} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setDraft(null)}>Voltar</Button><Button type="submit" disabled={loading} className="bg-black text-white hover:bg-black/85">{loading ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar alterações</Button></DialogFooter></form> : null}</DialogContent></Dialog>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Cancelar esta reserva?</DialogTitle><DialogDescription>Os lugares serão liberados imediatamente. Esta ação ficará registrada.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>Manter reserva</Button><Button variant="destructive" disabled={loading} onClick={cancelReservation}>{loading ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Cancelar reserva</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
