'use client';

import { useState } from 'react';
import { CheckCircle2, Clock3, Save, Settings, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Administração</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Configurações</h1><p className="mt-1 text-sm text-black/55">Revise as regras operacionais usadas pelo sistema.</p></div>
      {saved ? <div className="flex items-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"><CheckCircle2 className="size-5" /> Configurações validadas nesta demonstração.</div> : null}
      <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }} className="space-y-5">
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle className="flex items-center gap-2"><Clock3 className="size-5 text-haus-terracotta" /> Horários e antecedência</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="lunch-limit">Limite de chegada no almoço</Label><Input id="lunch-limit" type="time" defaultValue="11:30" /></div><div className="space-y-2"><Label htmlFor="dinner-limit">Limite de chegada no rodízio</Label><Input id="dinner-limit" type="time" defaultValue="19:00" /></div><div className="space-y-2"><Label htmlFor="min-hours">Antecedência mínima (horas)</Label><Input id="min-hours" type="number" defaultValue="24" /></div><div className="space-y-2"><Label htmlFor="max-months">Calendário aberto (meses)</Label><Input id="max-months" type="number" defaultValue="12" /></div></CardContent></Card>
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle className="flex items-center gap-2"><Users className="size-5 text-haus-terracotta" /> Capacidade e aprovação</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="capacity">Lugares por serviço</Label><Input id="capacity" type="number" defaultValue="70" /></div><div className="space-y-2"><Label htmlFor="automatic">Aprovação automática até</Label><Input id="automatic" type="number" defaultValue="20" /></div><div className="space-y-2"><Label htmlFor="delay">Tolerância de atraso (min)</Label><Input id="delay" type="number" defaultValue="10" /></div></CardContent></Card>
        <div className="flex justify-end"><Button type="submit" className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><Save /> Testar salvamento</Button></div>
      </form>
      <p className="flex items-center gap-2 text-xs text-black/45"><Settings className="size-4" /> Nesta fase, o botão valida somente o comportamento da tela; a gravação no Firebase será ligada na implementação seguinte.</p>
    </div>
  );
}
