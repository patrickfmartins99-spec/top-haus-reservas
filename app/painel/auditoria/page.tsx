import { History, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const events = [
  { time: '18:42', actor: 'Patrick Fernandes', action: 'Alterou uma reserva', detail: 'TH-4821 · observações atualizadas', origin: 'Colaborador' },
  { time: '18:31', actor: 'Sistema', action: 'Enviou confirmação', detail: 'TH-4822 · WhatsApp', origin: 'Automação' },
  { time: '17:55', actor: 'Marina Oliveira', action: 'Confirmou presença', detail: 'TH-4821 · link do cliente', origin: 'Cliente' },
  { time: '16:20', actor: 'Patrick Fernandes', action: 'Aprovou solicitação', detail: 'TH-4824 · grupo de 24 pessoas', origin: 'Colaborador' },
];

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Controle</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Auditoria</h1><p className="mt-1 text-sm text-black/55">Histórico de alterações realizadas por clientes, colaboradores e automações.</p></div>
      <Card className="bg-white ring-black/7"><CardHeader className="flex-row items-center justify-between border-b border-black/7"><div><CardTitle className="flex items-center gap-2"><History className="size-5 text-haus-terracotta" /> Atividades recentes</CardTitle><p className="mt-1 text-sm text-black/50">Demonstração da trilha de auditoria.</p></div><ShieldCheck className="size-6 text-black/35" /></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Horário</TableHead><TableHead>Responsável</TableHead><TableHead>Ação</TableHead><TableHead>Detalhes</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={`${event.time}-${event.action}`}><TableCell className="font-mono text-xs">{event.time}</TableCell><TableCell className="font-semibold">{event.actor}</TableCell><TableCell>{event.action}</TableCell><TableCell className="text-black/55">{event.detail}</TableCell><TableCell><Badge className={event.origin === 'Cliente' ? 'bg-black text-white' : event.origin === 'Automação' ? 'bg-haus-gold/20 text-[#6b451c]' : 'bg-[#e7e1db] text-[#4f3528]'}>{event.origin}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}
