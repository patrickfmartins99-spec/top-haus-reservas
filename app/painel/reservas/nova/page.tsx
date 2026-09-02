'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export default function NewReservationPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <div className="flex items-center gap-4"><Link href="/painel/reservas" aria-label="Voltar para reservas" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ArrowLeft /></Link><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Reservas</p><h1 className="mt-1 text-3xl font-extrabold tracking-[-0.03em]">Nova reserva</h1></div></div>
      {saved ? <output className="flex items-center gap-3 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"><CheckCircle2 className="size-5" /> Fluxo testado: os dados foram validados nesta demonstração.</output> : null}
      <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
        <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle>Dados do cliente</CardTitle><p className="text-sm text-black/50">Preencha as informações recebidas pelo telefone ou WhatsApp.</p></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="customer-name">Nome completo</Label><Input id="customer-name" required placeholder="Nome do responsável" /></div>
          <div className="space-y-2"><Label htmlFor="customer-phone">WhatsApp</Label><Input id="customer-phone" required placeholder="(47) 99999-9999" /></div>
          <div className="space-y-2"><Label htmlFor="reservation-date">Data</Label><Input id="reservation-date" type="date" required /></div>
          <div className="space-y-2"><Label htmlFor="service">Serviço</Label><NativeSelect id="service" className="w-full"><NativeSelectOption value="almoco">Almoço — chegada até 11h30</NativeSelectOption><NativeSelectOption value="rodizio">Rodízio — chegada até 19h</NativeSelectOption></NativeSelect></div>
          <div className="space-y-2"><Label htmlFor="party-size">Número de pessoas</Label><Input id="party-size" type="number" min={1} required placeholder="Inclua crianças e bebês" /></div>
          <div className="space-y-2"><Label htmlFor="preference">Preferência de lugar</Label><NativeSelect id="preference" className="w-full"><NativeSelectOption value="none">Sem preferência</NativeSelectOption><NativeSelectOption value="sofa">Sofá lateral</NativeSelectOption><NativeSelectOption value="window">Parede de vidro</NativeSelectOption><NativeSelectOption value="outlet">Parede com tomada</NativeSelectOption></NativeSelect></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" placeholder="Aniversário, acessibilidade, pedidos especiais..." /></div>
          <div className="flex flex-wrap justify-end gap-3 sm:col-span-2"><Link href="/painel/reservas" className={buttonVariants({ variant: 'outline' })}>Cancelar</Link><Button type="submit" className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><Save /> Testar criação</Button></div>
        </CardContent></Card>
      </form>
    </div>
  );
}
