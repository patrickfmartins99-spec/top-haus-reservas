import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  History,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { BrandLogo } from '@/components/brand-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  if (status === 'Aguardando aprovação') return 'bg-haus-gold/15 text-[#7b571d]';
  if (status === 'Presença confirmada') return 'bg-black text-white';
  return 'bg-haus-sage/10 text-haus-sage';
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <div className="grid min-h-screen lg:grid-cols-[252px_1fr]">
        <aside className="hidden border-r border-black/7 bg-haus-ink px-4 py-6 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <BrandLogo compact priority className="rounded-md" />
            <div className="border-l border-white/10 pl-3"><p className="text-sm font-bold">Reservas</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Equipe</p></div>
          </div>
          <nav className="mt-10 space-y-1 text-sm">
            {[
              { icon: LayoutDashboard, label: 'Visão geral', active: true },
              { icon: CalendarDays, label: 'Reservas' },
              { icon: ListOrdered, label: 'Fila de espera', count: 3 },
              { icon: History, label: 'Auditoria' },
              { icon: UserCog, label: 'Usuários', href: '/painel/usuarios' },
              { icon: Settings, label: 'Configurações' },
            ].map(({ icon: Icon, label, active, count, href }) => {
              const content = <><Icon className="size-4" />{label}{count ? <span className="ml-auto rounded-full bg-haus-terracotta px-2 py-0.5 text-[10px] font-bold text-white">{count}</span> : null}</>;
              const className = `flex items-center gap-3 rounded-lg px-3 py-2.5 ${active ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`;
              return href ? <Link key={label} href={href} className={className}>{content}</Link> : <a key={label} href="#" className={className}>{content}</a>;
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-4">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/55 hover:bg-white/5"><LogOut className="size-4" /> Sair</button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex h-20 items-center justify-between border-b border-black/7 bg-white px-5 sm:px-8">
            <div>
              <p className="text-xs font-medium text-haus-ink/45">Terça-feira, 1 de setembro</p>
              <h1 className="font-heading text-xl font-bold">Boa noite, equipe</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Notificações"><Bell className="size-4" /></Button>
              <button className="hidden items-center gap-2 rounded-lg border border-black/8 px-3 py-2 text-sm sm:flex"><span className="grid size-7 place-items-center rounded-full bg-haus-terracotta text-xs font-bold text-white">TH</span> Colaborador <ChevronDown className="size-3" /></button>
            </div>
          </header>

          <nav className="flex gap-2 overflow-x-auto border-b border-black/7 bg-white px-5 pb-3 lg:hidden" aria-label="Navegação do painel">
            <Link href="/painel" className="whitespace-nowrap rounded-full bg-black px-4 py-2 text-xs font-bold text-white">Visão geral</Link>
            <a href="#reservas" className="whitespace-nowrap rounded-full bg-black/5 px-4 py-2 text-xs font-semibold text-black/55">Reservas</a>
            <a href="#fila" className="whitespace-nowrap rounded-full bg-black/5 px-4 py-2 text-xs font-semibold text-black/55">Fila de espera</a>
            <Link href="/painel/usuarios" className="whitespace-nowrap rounded-full bg-black/5 px-4 py-2 text-xs font-semibold text-black/55">Usuários</Link>
          </nav>

          <div className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Visão geral</p><h2 className="mt-2 font-heading text-3xl font-extrabold tracking-[-0.03em]">Reservas de hoje</h2><p className="mt-1 text-sm text-haus-ink/50">Acompanhe almoço, rodízio e fila de espera.</p></div>
              <Button className="h-10 bg-black px-4 text-white hover:bg-black/85"><Plus className="size-4" /> Nova reserva</Button>
            </div>

            <div className="rounded-xl border border-haus-gold/25 bg-haus-gold/10 px-4 py-3 text-sm text-haus-ink/70">
              <strong>Dados de demonstração.</strong> O painel será conectado ao Firebase após inserir as credenciais do projeto.
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Pessoas reservadas', value: '38', detail: 'de 70 lugares', icon: Users },
                { label: 'Reservas', value: '9', detail: '7 confirmadas', icon: ClipboardList },
                { label: 'Aguardando aprovação', value: '1', detail: 'grupo de 24', icon: Clock3 },
                { label: 'Fila de espera', value: '3', detail: 'média de 11 min', icon: ListOrdered },
              ].map(({ label, value, detail, icon: Icon }) => (
                <Card key={label} className="gap-3 bg-white ring-black/7">
                  <CardHeader className="flex-row items-center justify-between"><p className="text-sm text-haus-ink/50">{label}</p><span className="grid size-8 place-items-center rounded-lg bg-haus-terracotta/8 text-haus-terracotta"><Icon className="size-4" /></span></CardHeader>
                  <CardContent><p className="font-heading text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-haus-ink/40">{detail}</p></CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
              <Card id="reservas" className="bg-white ring-black/7">
                <CardHeader className="flex-row items-center justify-between border-b border-black/6">
                  <div><CardTitle className="font-heading text-xl font-bold">Rodízio</CardTitle><p className="mt-1 text-xs text-haus-ink/45">38 de 70 lugares ocupados</p></div>
                  <Badge variant="outline" className="border-haus-sage/20 bg-haus-sage/8 text-haus-sage">54% ocupado</Badge>
                </CardHeader>
                <CardContent>
                  <div className="mb-5 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full w-[54%] rounded-full bg-haus-terracotta" /></div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Horário</TableHead><TableHead>Cliente</TableHead><TableHead>Pessoas</TableHead><TableHead>Preferência</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {reservations.map((reservation) => (
                        <TableRow key={`${reservation.time}-${reservation.name}`}>
                          <TableCell className="font-semibold">{reservation.time}</TableCell>
                          <TableCell><Link href="/painel/reservas/demo" className="font-semibold underline-offset-4 hover:underline">{reservation.name}</Link></TableCell>
                          <TableCell>{reservation.party}</TableCell>
                          <TableCell className="text-haus-ink/50">{reservation.preference}</TableCell>
                          <TableCell><Badge className={statusClass(reservation.status)}>{reservation.status}</Badge></TableCell>
                          <TableCell><Button variant="ghost" size="icon-sm" aria-label={`Opções de ${reservation.name}`}><MoreHorizontal /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card id="fila" className="bg-white ring-black/7">
                <CardHeader className="flex-row items-center justify-between border-b border-black/6"><div><CardTitle className="font-heading text-xl font-bold">Fila de espera</CardTitle><p className="mt-1 text-xs text-haus-ink/45">Atualizada agora</p></div><Badge className="bg-haus-terracotta text-white">3</Badge></CardHeader>
                <CardContent className="space-y-3">
                  {waitlist.map((entry) => (
                    <article key={entry.position} className="flex items-center gap-3 rounded-xl border border-black/7 p-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-haus-ink text-xs font-bold text-white">{entry.position}</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.name}</p><p className="text-xs text-haus-ink/45">{entry.party} pessoas · {entry.waiting}</p></div>
                      <Button variant="outline" size="sm">Chamar</Button>
                    </article>
                  ))}
                  <Button variant="ghost" className="w-full text-haus-terracotta">Ver fila completa</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
