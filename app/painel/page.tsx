import Link from 'next/link';
import { CalendarDays, ClipboardList, Clock3, ListOrdered, MoreHorizontal, Plus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const reservations = [
  { time: '18:30', name: 'Marina Oliveira', party: 4, preference: 'Sofá', status: 'Confirmada' },
  { time: '18:30', name: 'Rafael Santos', party: 8, preference: 'Parede de vidro', status: 'Confirmada' },
  { time: '18:45', name: 'Fernanda Lima', party: 2, preference: 'Sem preferência', status: 'Presença confirmada' },
  { time: '19:00', name: 'Grupo Almeida', party: 24, preference: 'Parede com tomada', status: 'Aguardando aprovação' },
];

const waitlist = [
  { position: 1, name: 'Carlos Mendes', party: 3, waiting: '18 min' },
  { position: 2, name: 'Juliana Rocha', party: 2, waiting: '11 min' },
  { position: 3, name: 'Paulo Nunes', party: 5, waiting: '4 min' },
];

function statusClass(status: string) {
  if (status === 'Aguardando aprovação') return 'bg-haus-gold/20 text-[#6b451c]';
  if (status === 'Presença confirmada') return 'bg-black text-white';
  return 'bg-[#e7e1db] text-[#4f3528]';
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Visão geral</p><h1 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">Reservas de hoje</h1><p className="mt-1 text-sm text-haus-ink/55">Acompanhe almoço, rodízio e fila de espera.</p></div>
        <Link href="/painel/reservas/nova" className={buttonVariants({ className: 'h-10 bg-black px-4 text-white hover:bg-black/85' })}><Plus className="size-4" /> Nova reserva</Link>
      </div>

      <div className="rounded-xl border border-haus-gold/35 bg-[#f4e7d7] px-4 py-3 text-sm text-haus-ink/75"><strong>Ambiente de testes.</strong> A navegação e os fluxos visuais estão ativos; os dados desta tela ainda são demonstrativos.</div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pessoas reservadas', value: '38', detail: 'de 70 lugares', icon: Users },
          { label: 'Reservas', value: '9', detail: '7 confirmadas', icon: ClipboardList },
          { label: 'Aguardando aprovação', value: '1', detail: 'grupo de 24', icon: Clock3 },
          { label: 'Fila de espera', value: '3', detail: 'média de 11 min', icon: ListOrdered },
        ].map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="gap-3 bg-white ring-black/7"><CardHeader className="flex-row items-center justify-between"><p className="text-sm text-haus-ink/55">{label}</p><span className="grid size-8 place-items-center rounded-lg bg-[#eadcd2] text-haus-terracotta"><Icon className="size-4" /></span></CardHeader><CardContent><p className="font-heading text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-haus-ink/45">{detail}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="bg-white ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6"><div><CardTitle className="font-heading text-xl font-bold">Rodízio</CardTitle><p className="mt-1 text-xs text-haus-ink/50">38 de 70 lugares ocupados</p></div><Badge variant="outline" className="border-[#8c4b28]/25 bg-[#eadcd2] text-[#6b351d]">54% ocupado</Badge></CardHeader>
          <CardContent>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full w-[54%] rounded-full bg-haus-terracotta" /></div>
            <Table><TableHeader><TableRow><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Pessoas</TableHead><TableHead>Preferência</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {reservations.map((reservation) => <TableRow key={`${reservation.time}-${reservation.name}`}><TableCell className="font-semibold">{reservation.time}</TableCell><TableCell><Link href="/painel/reservas/demo" className="font-semibold underline-offset-4 hover:underline">{reservation.name}</Link></TableCell><TableCell>{reservation.party}</TableCell><TableCell className="text-haus-ink/55">{reservation.preference}</TableCell><TableCell><Badge className={statusClass(reservation.status)}>{reservation.status}</Badge></TableCell><TableCell><Link href="/painel/reservas/demo" aria-label={`Abrir ${reservation.name}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><MoreHorizontal /></Link></TableCell></TableRow>)}
            </TableBody></Table>
            <Link href="/painel/reservas" className={buttonVariants({ variant: 'outline', className: 'mt-5 w-full' })}><CalendarDays /> Ver todas as reservas</Link>
          </CardContent>
        </Card>

        <Card className="bg-white ring-black/7">
          <CardHeader className="flex-row items-center justify-between border-b border-black/6"><div><CardTitle className="font-heading text-xl font-bold">Fila de espera</CardTitle><p className="mt-1 text-xs text-haus-ink/50">Atualizada agora</p></div><Badge className="bg-haus-terracotta text-white">3</Badge></CardHeader>
          <CardContent className="space-y-3">{waitlist.map((entry) => <article key={entry.position} className="flex items-center gap-3 rounded-xl border border-black/7 p-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">{entry.position}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.name}</p><p className="text-xs text-haus-ink/50">{entry.party} pessoas · {entry.waiting}</p></div></article>)}<Link href="/painel/fila" className={buttonVariants({ variant: 'ghost', className: 'w-full text-haus-terracotta hover:text-haus-terracotta' })}>Ver fila completa</Link></CardContent>
        </Card>
      </div>
    </div>
  );
}
