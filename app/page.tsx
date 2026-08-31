'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  LoaderCircle,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Service = 'almoco' | 'rodizio';

const services: Record<
  Service,
  { label: string; subtitle: string; times: string[]; cutoff: string }
> = {
  almoco: {
    label: 'Almoço',
    subtitle: 'Terça a domingo',
    times: ['11:00', '11:15', '11:30'],
    cutoff: '11h30',
  },
  rodizio: {
    label: 'Rodízio',
    subtitle: 'Terça a domingo',
    times: ['18:30', '18:45', '19:00'],
    cutoff: '19h',
  },
};

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [service, setService] = useState<Service>('rodizio');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:30');
  const [partySize, setPartySize] = useState(2);
  const [checked, setChecked] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [seatingPreference, setSeatingPreference] = useState('sem_preferencia');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; status: string; demo?: boolean } | null>(null);
  const [error, setError] = useState('');

  const { minDate, maxDate } = useMemo(() => {
    const minimum = new Date();
    minimum.setDate(minimum.getDate() + 1);
    const maximum = new Date();
    maximum.setFullYear(maximum.getFullYear() + 1);
    return { minDate: toDateInput(minimum), maxDate: toDateInput(maximum) };
  }, []);

  const mondaySelected = useMemo(() => {
    if (!date) return false;
    return new Date(`${date}T12:00:00`).getDay() === 1;
  }, [date]);

  function chooseService(nextService: Service) {
    setService(nextService);
    setTime(services[nextService].times[0]);
    setChecked(false);
  }

  async function checkAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date) return;
    if (!checked) {
      setChecked(true);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          serviceDate: date,
          arrivalTime: time,
          partySize,
          customerName,
          whatsapp,
          seatingPreference,
          notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir a reserva.');
      setResult(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível concluir a reserva.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="border-b border-white/10 bg-haus-ink text-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Top Haus — início">
            <span className="grid size-11 place-items-center rounded-full border border-haus-gold/40 bg-white/5">
              <UtensilsCrossed className="size-5 text-haus-gold" />
            </span>
            <span>
              <span className="block font-heading text-xl font-bold tracking-[0.14em]">TOP HAUS</span>
              <span className="block text-[10px] uppercase tracking-[0.3em] text-white/55">Restaurante</span>
            </span>
          </a>
          <a
            href="/entrar"
            className="hidden items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-haus-gold/60 hover:text-white sm:flex"
          >
            Acesso da equipe
            <ChevronRight className="size-4" />
          </a>
        </div>
      </header>

      <section id="inicio" className="relative bg-haus-ink text-white">
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-28 -top-28 size-[32rem] rounded-full border border-haus-gold/10" />
          <div className="absolute -right-10 top-8 size-[23rem] rounded-full border border-haus-gold/10" />
          <div className="absolute bottom-0 left-[8%] h-px w-[84%] bg-gradient-to-r from-transparent via-haus-gold/30 to-transparent" />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:pb-24 lg:pt-20">
          <div className="max-w-xl">
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em] text-haus-gold">
              <span className="h-px w-7 bg-haus-gold" />
              Sua mesa está esperando
            </p>
            <h1 className="font-heading text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
              Reserve seu momento no Top Haus.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/65 sm:text-lg">
              Escolha o almoço ou o rodízio, informe o tamanho do grupo e encontre o melhor horário para sua visita.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
              <span className="flex items-center gap-2"><Check className="size-4 text-haus-gold" /> Confirmação pelo WhatsApp</span>
              <span className="flex items-center gap-2"><Check className="size-4 text-haus-gold" /> Sem necessidade de cadastro</span>
            </div>
          </div>

          <Card id="reserva" className="border-0 bg-[#fffdf8] py-0 text-haus-ink shadow-[0_28px_80px_rgba(0,0,0,0.28)] ring-0">
            <CardHeader className="border-b border-black/7 px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="font-heading text-2xl font-bold">Fazer uma reserva</CardTitle>
                  <CardDescription className="mt-1 text-haus-ink/55">Leva menos de dois minutos.</CardDescription>
                </div>
                <span className="hidden rounded-full bg-haus-sage/12 px-3 py-1.5 text-xs font-semibold text-haus-sage sm:inline-flex">Até 12 meses</span>
              </div>
            </CardHeader>
            <CardContent className="px-5 py-5 sm:px-7 sm:py-6">
              {result ? (
                <div className="py-5 text-center" role="status">
                  <span className="mx-auto grid size-16 place-items-center rounded-full bg-haus-sage/10 text-haus-sage"><CheckCircle2 className="size-8" /></span>
                  <h2 className="mt-5 font-heading text-2xl font-bold">
                    {result.status === 'confirmed' ? 'Reserva confirmada!' : 'Solicitação enviada!'}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-haus-ink/60">
                    {result.status === 'confirmed'
                      ? 'Você receberá os detalhes e o link de confirmação pelo WhatsApp.'
                      : 'A equipe do Top Haus analisará o seu grupo e enviará a resposta pelo WhatsApp.'}
                  </p>
                  {result.demo && (
                    <p className="mx-auto mt-4 max-w-md rounded-lg bg-haus-gold/15 px-4 py-3 text-xs font-medium text-haus-ink/70">
                      Modo de demonstração: a experiência foi concluída, mas os dados ainda não foram gravados porque o Firebase não está conectado.
                    </p>
                  )}
                  <p className="mt-5 text-xs uppercase tracking-[0.16em] text-haus-ink/45">Código {result.id}</p>
                  <Button type="button" variant="outline" className="mt-6" onClick={() => { setResult(null); setChecked(false); }}>
                    Fazer outra reserva
                  </Button>
                </div>
              ) : (
              <form onSubmit={checkAvailability} className="space-y-6">
                <fieldset>
                  <legend className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-haus-ink/50">Escolha o serviço</legend>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(services) as Service[]).map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => chooseService(item)}
                        className={cn(
                          'rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-haus-gold/30',
                          service === item
                            ? 'border-haus-terracotta bg-haus-terracotta/[0.07] shadow-[inset_0_0_0_1px_var(--color-haus-terracotta)]'
                            : 'border-black/10 bg-white hover:border-black/25',
                        )}
                      >
                        <span className="block font-heading text-base font-bold">{services[item].label}</span>
                        <span className="mt-1 block text-xs text-haus-ink/50">{services[item].subtitle}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="date"><CalendarDays className="size-4 text-haus-terracotta" /> Data</Label>
                    <Input
                      id="date"
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={date}
                      onChange={(event) => { setDate(event.target.value); setChecked(false); }}
                      className="h-11 border-black/12 bg-white px-3"
                      required
                    />
                    {mondaySelected && (
                      <p className="text-xs font-medium text-[#7b571d]">Segundas-feiras abrem somente em datas especiais; a disponibilidade será verificada.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label><Users className="size-4 text-haus-terracotta" /> Pessoas</Label>
                    <div className="flex h-11 items-center justify-between rounded-lg border border-black/12 bg-white px-2">
                      <button type="button" onClick={() => { setPartySize((value) => Math.max(1, value - 1)); setChecked(false); }} className="grid size-8 place-items-center rounded-md hover:bg-black/5" aria-label="Remover uma pessoa"><Minus className="size-4" /></button>
                      <strong className="min-w-24 text-center text-sm">{partySize} {partySize === 1 ? 'pessoa' : 'pessoas'}</strong>
                      <button type="button" onClick={() => { setPartySize((value) => value + 1); setChecked(false); }} className="grid size-8 place-items-center rounded-md hover:bg-black/5" aria-label="Adicionar uma pessoa"><Plus className="size-4" /></button>
                    </div>
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-3 flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4 text-haus-terracotta" /> Horário de chegada</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {services[service].times.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => { setTime(item); setChecked(false); }}
                        className={cn(
                          'h-10 rounded-lg border text-sm font-semibold transition',
                          time === item ? 'border-haus-ink bg-haus-ink text-white' : 'border-black/10 bg-white hover:border-black/25',
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-haus-ink/50">Reservas para {services[service].label.toLowerCase()} são aceitas até {services[service].cutoff}. Há 10 minutos de tolerância.</p>
                </fieldset>

                {checked && (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-haus-sage/25 bg-haus-sage/[0.07] p-4" role="status">
                      <p className="flex items-center gap-2 font-semibold text-haus-sage"><ShieldCheck className="size-5" /> Horário disponível</p>
                      <p className="mt-1 text-sm text-haus-ink/60">
                        {partySize <= 20
                          ? 'Preencha seus dados para confirmar a reserva automaticamente.'
                          : 'Preencha seus dados para enviar o grupo à aprovação da equipe.'}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="customer-name">Nome</Label>
                        <Input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="h-11 border-black/12 bg-white" placeholder="Seu nome" minLength={2} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp">WhatsApp</Label>
                        <Input id="whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} className="h-11 border-black/12 bg-white" placeholder="(00) 00000-0000" inputMode="tel" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preference">Preferência de lugar</Label>
                      <NativeSelect id="preference" value={seatingPreference} onChange={(event) => setSeatingPreference(event.target.value)} className="w-full [&>select]:h-11 [&>select]:border-black/12 [&>select]:bg-white">
                        <NativeSelectOption value="sem_preferencia">Sem preferência</NativeSelectOption>
                        <NativeSelectOption value="sofa">Sofá lateral</NativeSelectOption>
                        <NativeSelectOption value="parede_vidro">Parede de vidro</NativeSelectOption>
                        <NativeSelectOption value="parede_tomada">Parede com tomada</NativeSelectOption>
                      </NativeSelect>
                      <p className="text-xs text-haus-ink/45">A preferência depende da disponibilidade e não garante a mesa escolhida.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Aniversário, acessibilidade ou outro pedido especial" maxLength={1000} className="border-black/12 bg-white" />
                    </div>
                  </div>
                )}

                {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p>}

                <Button type="submit" size="lg" disabled={!date || submitting} className="h-12 w-full rounded-xl bg-haus-terracotta text-base font-bold text-white hover:bg-haus-terracotta/90">
                  {submitting && <LoaderCircle className="size-5 animate-spin" />}
                  {checked ? (partySize <= 20 ? 'Confirmar reserva' : 'Enviar para aprovação') : 'Ver disponibilidade'}
                  {!submitting && <ChevronRight className="size-5" />}
                </Button>
              </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-[#f7f2e8] px-5 py-12 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3">
          {[
            { icon: Clock3, title: 'Chegue no horário', text: 'Sua mesa fica reservada por 10 minutos após o horário escolhido.' },
            { icon: MessageCircle, title: 'Acompanhe pelo WhatsApp', text: 'Confirmações, lembretes e alterações chegam diretamente no seu telefone.' },
            { icon: CalendarDays, title: 'Planeje com antecedência', text: 'Reserve com no mínimo 24 horas e até 12 meses de antecedência.' },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="flex gap-4 rounded-2xl border border-black/7 bg-white/60 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-haus-terracotta/10 text-haus-terracotta"><Icon className="size-5" /></span>
              <div>
                <h2 className="font-heading font-bold text-haus-ink">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-haus-ink/55">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
