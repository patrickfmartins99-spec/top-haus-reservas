'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  History,
  MessageCircle,
  Phone,
  Save,
  UserRound,
  Users,
  X,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type DemoStatus = 'Confirmada' | 'Cliente chegou' | 'Não compareceu' | 'Cancelada';

export default function DemoReservationPage() {
  const [status, setStatus] = useState<DemoStatus>('Confirmada');
  const [notes, setNotes] = useState('Cliente prefere sofá lateral, se disponível.');
  const [saved, setSaved] = useState(false);

  return (
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <header className="border-b border-white/10 bg-black text-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3"><BrandLogo compact priority className="rounded-md" /><span className="hidden border-l border-white/10 pl-3 text-sm text-white/60 sm:block">Detalhes da reserva</span></div>
          <Link href="/painel" className="flex items-center gap-2 text-sm font-medium text-white/65 transition hover:text-white"><ArrowLeft className="size-4" /> Voltar ao painel</Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Reserva TH-4821</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Marina Oliveira</h1><p className="mt-1 text-sm text-black/45">Criada pelo cliente em 28 de agosto, às 14h32.</p></div>
          <Badge className={status === 'Cliente chegou' ? 'bg-black text-white' : status === 'Confirmada' ? 'bg-haus-sage/12 text-haus-sage' : 'bg-destructive/10 text-destructive'}>{status}</Badge>
        </div>

        <div className="rounded-xl border border-haus-gold/30 bg-haus-gold/10 px-4 py-3 text-sm text-black/60"><strong>Fluxo demonstrativo.</strong> As alterações desta tela ainda não são gravadas no Firebase.</div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card className="bg-[#fdfcf9] ring-black/6">
              <CardHeader className="border-b border-black/7"><CardTitle className="text-xl font-bold">Informações da reserva</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[{ icon: CalendarDays, label: 'Data', value: '12 de setembro' }, { icon: Clock3, label: 'Chegada', value: '18h30' }, { icon: Users, label: 'Grupo', value: '4 pessoas' }, { icon: UserRound, label: 'Preferência', value: 'Sofá lateral' }].map(({ icon: Icon, label, value }) => <div key={label} className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><Icon className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs text-black/40">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}
              </CardContent>
            </Card>

            <Card className="bg-[#fdfcf9] ring-black/6">
              <CardHeader className="border-b border-black/7"><CardTitle className="text-xl font-bold">Contato e observações</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2"><a href="tel:+5547999999999" className="flex items-center gap-3 rounded-xl border border-black/8 bg-white p-4 text-sm font-semibold"><Phone className="size-4 text-haus-terracotta" /> (47) 99999-9999</a><button className="flex items-center gap-3 rounded-xl border border-black/8 bg-white p-4 text-left text-sm font-semibold"><MessageCircle className="size-4 text-haus-terracotta" /> Enviar mensagem</button></div>
                <div><label htmlFor="reservation-notes" className="text-sm font-semibold">Observações internas</label><Textarea id="reservation-notes" value={notes} onChange={(event) => { setNotes(event.target.value); setSaved(false); }} className="mt-2 min-h-28 bg-white" /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-black/40">Visível somente para a equipe.</p><Button type="button" onClick={() => setSaved(true)} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><Save /> {saved ? 'Salvo' : 'Salvar observação'}</Button></div></div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="bg-black text-white ring-0">
              <CardHeader><CardTitle className="text-xl font-bold">Atualizar situação</CardTitle><p className="text-sm leading-6 text-white/50">Escolha a ação que representa o atendimento atual.</p></CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" onClick={() => setStatus('Cliente chegou')} className="h-11 w-full bg-white text-black hover:bg-white/85"><Check /> Marcar chegada</Button>
                <Button type="button" onClick={() => setStatus('Não compareceu')} variant="outline" className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"><Clock3 /> Não compareceu</Button>
                <Button type="button" onClick={() => setStatus('Cancelada')} variant="outline" className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"><X /> Cancelar reserva</Button>
              </CardContent>
            </Card>

            <Card className="bg-[#fdfcf9] ring-black/6">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg font-bold"><History className="size-5 text-haus-terracotta" /> Histórico</CardTitle></CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="border-l-2 border-black/10 pl-4"><p className="font-semibold">Reserva confirmada</p><p className="mt-1 text-xs text-black/40">Sistema · 28 ago, 14h32</p></div>
                <div className="border-l-2 border-black/10 pl-4"><p className="font-semibold">Mensagem enviada pelo WhatsApp</p><p className="mt-1 text-xs text-black/40">Sistema · 28 ago, 14h33</p></div>
                {status !== 'Confirmada' && <div className="border-l-2 border-haus-terracotta pl-4"><p className="font-semibold">Situação alterada para {status.toLowerCase()}</p><p className="mt-1 text-xs text-black/40">Colaborador · agora</p></div>}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
