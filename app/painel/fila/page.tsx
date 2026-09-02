'use client';

import { useState } from 'react';
import { Check, Clock3, MessageCircle, PhoneCall, Plus, UserRoundX, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type QueueEntry = { id: number; name: string; party: number; waiting: string; status: 'Aguardando' | 'Chamado' | 'Atendido' };

const initialQueue: QueueEntry[] = [
  { id: 1, name: 'Carlos Mendes', party: 3, waiting: '18 min', status: 'Aguardando' },
  { id: 2, name: 'Juliana Rocha', party: 2, waiting: '11 min', status: 'Aguardando' },
  { id: 3, name: 'Paulo Nunes', party: 5, waiting: '4 min', status: 'Aguardando' },
];

export default function WaitlistPage() {
  const [queue, setQueue] = useState(initialQueue);

  function setStatus(id: number, status: QueueEntry['status']) {
    setQueue((entries) => entries.map((entry) => entry.id === id ? { ...entry, status } : entry));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento sem reserva</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Fila de espera</h1><p className="mt-1 text-sm text-black/55">Organize a ordem de chegada e teste as ações da recepção.</p></div><Button className="bg-black text-white hover:bg-black/85" onClick={() => setQueue((entries) => [...entries, { id: Date.now(), name: 'Novo cliente', party: 2, waiting: 'agora', status: 'Aguardando' }])}><Plus /> Adicionar à fila</Button></div>

      <div className="grid gap-4 sm:grid-cols-3">{[{ label: 'Aguardando', value: queue.filter((item) => item.status === 'Aguardando').length, icon: Clock3 }, { label: 'Pessoas na fila', value: queue.filter((item) => item.status !== 'Atendido').reduce((sum, item) => sum + item.party, 0), icon: Users }, { label: 'Tempo estimado', value: '15 min', icon: MessageCircle }].map(({ label, value, icon: Icon }) => <Card key={label} className="bg-white ring-black/7"><CardContent className="flex items-center justify-between"><div><p className="text-sm text-black/50">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></div><span className="grid size-10 place-items-center rounded-xl bg-[#eadcd2] text-haus-terracotta"><Icon /></span></CardContent></Card>)}</div>

      <Card className="bg-white ring-black/7"><CardHeader className="border-b border-black/7"><CardTitle>Ordem de atendimento</CardTitle><p className="text-sm text-black/50">Os botões abaixo já respondem para permitir o teste do fluxo.</p></CardHeader><CardContent className="space-y-3">
        {queue.map((entry, index) => <article key={entry.id} className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${entry.status === 'Atendido' ? 'border-black/5 bg-black/[0.03] opacity-60' : entry.status === 'Chamado' ? 'border-haus-terracotta/35 bg-[#f4e7d7]' : 'border-black/8'}`}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{entry.name}</p><Badge className={entry.status === 'Chamado' ? 'bg-haus-terracotta text-white' : entry.status === 'Atendido' ? 'bg-black/10 text-black/55' : 'bg-[#e7e1db] text-[#4f3528]'}>{entry.status}</Badge></div><p className="mt-1 text-sm text-black/50">{entry.party} pessoas · esperando {entry.waiting}</p></div><div className="flex flex-wrap gap-2">{entry.status === 'Aguardando' ? <Button onClick={() => setStatus(entry.id, 'Chamado')} className="bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><PhoneCall /> Chamar</Button> : null}{entry.status === 'Chamado' ? <Button onClick={() => setStatus(entry.id, 'Atendido')} className="bg-black text-white hover:bg-black/85"><Check /> Marcar atendido</Button> : null}{entry.status !== 'Atendido' ? <Button variant="outline" onClick={() => setStatus(entry.id, 'Atendido')}><UserRoundX /> Remover</Button> : null}</div></article>)}
      </CardContent></Card>
    </div>
  );
}
