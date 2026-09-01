'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MinhaReservaPage() {
  const [code, setCode] = useState('TH-4821');
  const [whatsapp, setWhatsapp] = useState('');
  const [found, setFound] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function findReservation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFound(true);
  }

  return (
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <header className="border-b border-white/10 bg-black text-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Top Haus — página inicial">
            <BrandLogo compact priority className="rounded-md" />
          </Link>
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-white">
            <ArrowLeft className="size-4" /> Voltar para reservas
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:py-16">
        <div className="max-w-md pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-haus-terracotta">Área do cliente</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.035em]">Acompanhe sua reserva.</h1>
          <p className="mt-4 leading-7 text-black/55">
            Consulte os detalhes, confirme sua presença ou veja como solicitar uma alteração pelo WhatsApp.
          </p>
          <div className="mt-8 space-y-4 text-sm text-black/55">
            <p className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white"><MessageCircle className="size-4 text-haus-terracotta" /></span> Use o mesmo WhatsApp informado na reserva.</p>
            <p className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white"><Clock3 className="size-4 text-haus-terracotta" /></span> Cancelamentos pelo site até 24 horas antes.</p>
          </div>
        </div>

        <Card className="border-0 bg-[#fdfcf9] py-0 shadow-[0_24px_70px_rgba(0,0,0,0.12)] ring-black/5">
          <CardContent className="p-6 sm:p-8">
            {!found ? (
              <form onSubmit={findReservation} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Localizar reserva</h2>
                  <p className="mt-1 text-sm text-black/50">Os dados estão na mensagem enviada pelo Top Haus.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reservation-code">Código da reserva</Label>
                  <Input id="reservation-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="h-12 bg-white" placeholder="Ex.: TH-4821" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reservation-whatsapp">WhatsApp</Label>
                  <Input id="reservation-whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="h-12 bg-white" placeholder="(00) 00000-0000" inputMode="tel" required />
                </div>
                <Button type="submit" className="h-12 w-full bg-haus-terracotta text-base font-bold text-white hover:bg-haus-terracotta/90">
                  <Search className="size-5" /> Consultar reserva
                </Button>
                <p className="text-center text-xs text-black/40">Tela demonstrativa para validação do fluxo.</p>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-black/8 pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Reserva {code}</p>
                    <h2 className="mt-2 text-2xl font-bold">Rodízio no Top Haus</h2>
                  </div>
                  <span className="rounded-full bg-haus-sage/10 px-3 py-1.5 text-xs font-bold text-haus-sage">
                    {confirmed ? 'Presença confirmada' : 'Confirmada'}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><CalendarDays className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs text-black/45">Data</p><p className="mt-1 font-bold">12 de setembro</p></div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><Clock3 className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs text-black/45">Chegada</p><p className="mt-1 font-bold">18h30</p></div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-black/6"><Users className="size-5 text-haus-terracotta" /><p className="mt-3 text-xs text-black/45">Pessoas</p><p className="mt-1 font-bold">4 pessoas</p></div>
                </div>

                <div className="rounded-2xl border border-haus-gold/30 bg-haus-gold/10 p-4 text-sm leading-6 text-black/60">
                  Sua mesa será mantida por 10 minutos após o horário de chegada. Crianças e bebês já devem estar incluídos na quantidade de pessoas.
                </div>

                {confirmed ? (
                  <output className="block rounded-2xl bg-haus-sage/10 p-5 text-center text-haus-sage">
                    <CheckCircle2 className="mx-auto size-7" />
                    <p className="mt-2 font-bold">Presença confirmada</p>
                    <p className="mt-1 text-sm opacity-75">Nos vemos em breve no Top Haus.</p>
                  </output>
                ) : (
                  <Button type="button" onClick={() => setConfirmed(true)} className="h-12 w-full bg-black text-base font-bold text-white hover:bg-black/85">
                    <CheckCircle2 className="size-5" /> Confirmar presença
                  </Button>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="h-11" onClick={() => setFound(false)}>Consultar outra reserva</Button>
                  <Button type="button" variant="outline" className="h-11 border-haus-terracotta/30 text-haus-terracotta"><MessageCircle /> Solicitar alteração</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
