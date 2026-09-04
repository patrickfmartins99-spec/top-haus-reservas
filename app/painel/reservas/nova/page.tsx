'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Save, ArrowLeft } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { minimumBookingDate, brazilDate } from '@/lib/domain/reservations';
import { DEFAULT_OPERATIONAL_SETTINGS } from '@/lib/domain/operational-settings';
import { getFirebaseClient } from '@/lib/firebase/client';

type Service = 'almoco' | 'rodizio';

const times: Record<Service, string[]> = {
  almoco: ['11:00', '11:15', '11:30'],
  rodizio: ['18:30', '18:45', '19:00'],
};

export default function NewReservationPage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [service, setService] = useState<Service>('almoco');
  const [arrivalTime, setArrivalTime] = useState('11:00');
  const [partySize, setPartySize] = useState('2');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [settings, setSettings] = useState(DEFAULT_OPERATIONAL_SETTINGS);
  useEffect(() => { fetch('/api/configuracoes/publicas').then(async (r) => { if (r.ok) setSettings((await r.json()).settings); }).catch(() => undefined); }, []);

  const { minDate, maxDate } = useMemo(() => {
    const minimum = minimumBookingDate(service, settings.minAdvanceHours);
    const maximum = new Date(); maximum.setMonth(maximum.getMonth() + settings.maxBookingMonths);
    return { minDate: minimum, maxDate: brazilDate(maximum) };
  }, [service, settings]);

  function changeService(nextService: Service) {
    setService(nextService);
    setArrivalTime(times[nextService][0]);
  }

  async function createReservation(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const firebase = getFirebaseClient();
    const user = firebase?.auth.currentUser;
    if (!user) { setError('Sua sessão expirou. Entre novamente.'); return; }

    setSaving(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerName, whatsapp, serviceDate, service, arrivalTime, partySize: Number(partySize), notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível criar a reserva.');
      router.push(`/painel/reservas?criada=${encodeURIComponent(data.id)}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível criar a reserva.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <div className="flex items-center gap-4"><Link href="/painel/reservas" aria-label="Voltar para reservas" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ArrowLeft /></Link><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Reservas</p><h1 className="mt-1 text-3xl font-extrabold tracking-[-0.03em]">Nova reserva</h1></div></div>
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      <p className="rounded-xl bg-white p-4 text-sm font-semibold">Rodízio: reservas até as 18h do dia da visita. Almoço: {settings.minAdvanceHours} horas de antecedência. Horário de Brasília.</p>
      <form onSubmit={createReservation}>
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle>Dados do cliente</CardTitle><p className="text-sm text-black/50">A reserva será salva no Firebase e ficará disponível para toda a equipe.</p></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="customer-name">Nome completo</Label><Input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required minLength={2} placeholder="Nome do responsável" /></div>
          <div className="space-y-2"><Label htmlFor="customer-phone">WhatsApp</Label><Input id="customer-phone" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} required minLength={10} inputMode="tel" placeholder="(47) 99999-9999" /></div>
          <div className="space-y-2"><Label htmlFor="reservation-date">Data</Label><Input id="reservation-date" type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} min={minDate} max={maxDate} required /></div>
          <div className="space-y-2"><Label htmlFor="service">Serviço</Label><NativeSelect id="service" value={service} onChange={(event) => changeService(event.target.value as Service)} className="w-full"><NativeSelectOption value="almoco">Almoço — chegada até 11h30</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio — chegada até 19h</NativeSelectOption></NativeSelect></div>
          <div className="space-y-2"><Label htmlFor="arrival-time">Horário de chegada</Label><NativeSelect id="arrival-time" value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} className="w-full">{times[service].map((time) => <NativeSelectOption key={time} value={time}>{time}</NativeSelectOption>)}</NativeSelect></div>
          <div className="space-y-2"><Label htmlFor="party-size">Número de pessoas</Label><Input id="party-size" type="number" value={partySize} onChange={(event) => setPartySize(event.target.value)} min={1} required /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Aniversário, acessibilidade, pedidos especiais..." /></div>
          <div className="rounded-xl border border-haus-gold/35 bg-[#f4e7d7] px-4 py-3 text-sm text-black/65 sm:col-span-2"><strong>Confirmação:</strong> até 20 pessoas a reserva será confirmada automaticamente. Grupos maiores ficarão aguardando aprovação.</div>
          <div className="flex flex-wrap justify-end gap-3 sm:col-span-2"><Link href="/painel/reservas" className={buttonVariants({ variant: 'outline' })}>Cancelar</Link><Button type="submit" disabled={saving} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90">{saving ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar reserva</Button></div>
        </CardContent></Card>
      </form>
    </div>
  );
}
