import Link from 'next/link';
import { CalendarDays, ChevronRight, Filter, Plus, Search, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const reservations = [
  { id: 'TH-4821', time: '18:30', name: 'Marina Oliveira', phone: '(47) 99999-9999', party: 4, status: 'Confirmada' },
  { id: 'TH-4822', time: '18:30', name: 'Rafael Santos', phone: '(47) 98888-1111', party: 8, status: 'Confirmada' },
  { id: 'TH-4823', time: '18:45', name: 'Fernanda Lima', phone: '(47) 97777-2222', party: 2, status: 'Presença confirmada' },
  { id: 'TH-4824', time: '19:00', name: 'Grupo Almeida', phone: '(47) 96666-3333', party: 24, status: 'Aguardando aprovação' },
];

export default function ReservationsPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Atendimento</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Reservas</h1><p className="mt-1 text-sm text-black/55">Consulte, crie e acompanhe as reservas do restaurante.</p></div>
        <Link href="/painel/reservas/nova" className={buttonVariants({ className: 'bg-black text-white hover:bg-black/85' })}><Plus /> Nova reserva</Link>
      </div>

      <Card className="bg-white ring-black/7">
        <CardHeader className="gap-4 border-b border-black/7 lg:flex-row lg:items-center lg:justify-between">
          <div><CardTitle className="text-xl font-bold">Reservas do dia</CardTitle><p className="mt-1 text-sm text-black/50">Terça-feira, 1 de setembro</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" /><Input aria-label="Buscar reserva" placeholder="Buscar cliente" className="pl-9 sm:w-64" /></div><Button variant="outline"><CalendarDays /> Alterar data</Button><Button variant="outline"><Filter /> Filtrar</Button></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Contato</TableHead><TableHead>Pessoas</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {reservations.map((reservation) => <TableRow key={reservation.id}><TableCell className="font-mono text-xs text-black/45">{reservation.id}</TableCell><TableCell className="font-bold">{reservation.time}</TableCell><TableCell className="font-semibold">{reservation.name}</TableCell><TableCell className="text-black/55">{reservation.phone}</TableCell><TableCell><span className="flex items-center gap-1"><Users className="size-4 text-haus-terracotta" /> {reservation.party}</span></TableCell><TableCell><Badge className={reservation.status === 'Aguardando aprovação' ? 'bg-haus-gold/20 text-[#6b451c]' : reservation.status === 'Presença confirmada' ? 'bg-black text-white' : 'bg-[#e7e1db] text-[#4f3528]'}>{reservation.status}</Badge></TableCell><TableCell><Link href="/painel/reservas/demo" aria-label={`Abrir reserva de ${reservation.name}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><ChevronRight /></Link></TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}
