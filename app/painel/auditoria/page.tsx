'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { History, LoaderCircle, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getFirebaseClient } from '@/lib/firebase/client';

type AuditEvent = {
  id: string;
  action: string;
  actorType: string;
  actorName: string;
  reservationId: string | null;
  waitlistId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string | null;
  tableChange: string | null;
};

const actionLabels: Record<string, string> = {
  reservation_created: 'Criou uma reserva',
  reservation_updated: 'Alterou uma reserva',
  reservation_updated_by_customer: 'Alterou a própria reserva',
  reservation_presence_confirmed: 'Confirmou presença',
  reservation_cancelled: 'Cancelou uma reserva',
  reservation_deleted: 'Excluiu uma reserva (histórico preservado)',
  reservation_table_assigned: 'Definiu ou alterou a mesa',
  whatsapp_manual_sent: 'Registrou envio manual pelo WhatsApp',
  whatsapp_discarded: 'Descartou uma mensagem pendente',
  waitlist_created: 'Adicionou cliente à fila',
  waitlist_updated: 'Alterou cliente da fila',
  waitlist_status_changed: 'Alterou situação da fila',
  staff_created: 'Criou um colaborador',
  staff_updated: 'Alterou um colaborador',
  staff_profile_updated: 'Atualizou a própria conta',
  staff_deleted: 'Excluiu um acesso',
  staff_deletion_requested: 'Solicitou exclusão de acesso',
  settings_updated: 'Alterou as configurações',
};

const statusLabels: Record<string, string> = {
  waiting: 'aguardando',
  called: 'chamado',
  seated: 'atendido',
  removed: 'removido',
  pending_approval: 'aguardando aprovação',
  confirmed: 'confirmada',
  presence_confirmed: 'presença confirmada',
  cancelled: 'cancelada',
  no_show: 'não compareceu',
  completed: 'concluída',
  deleted: 'excluída',
};

function formatDateTime(value: string | null) {
  if (!value) return 'Agora';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function eventDetail(event: AuditEvent) {
  const code = event.reservationId ?? event.waitlistId;
  const statusChange = event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus
    ? ` · ${statusLabels[event.fromStatus] ?? event.fromStatus} → ${statusLabels[event.toStatus] ?? event.toStatus}`
    : '';
  return `${code ?? 'Registro'}${statusChange}${event.tableChange ? ` · Mesa: ${event.tableChange}` : ''}`;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => { setError('Firebase não configurado.'); setLoading(false); }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/auditoria', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar a auditoria.');
        setEvents(data.events);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível carregar a auditoria.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Controle</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Auditoria</h1><p className="mt-1 text-sm text-black/65">Histórico real de alterações realizadas por clientes, colaboradores e automações.</p></div>
      {error ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      <Card className="bg-white ring-black/7">
        <CardHeader className="flex-row items-center justify-between border-b border-black/7"><div><CardTitle className="flex items-center gap-2"><History className="size-5 text-haus-terracotta" /> Atividades recentes</CardTitle><p className="mt-1 text-sm text-black/65">Registros salvos automaticamente no Firebase.</p></div><ShieldCheck className="size-6 text-black/60" /></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-black/65"><LoaderCircle className="size-4 animate-spin" /> Carregando atividades...</p> : null}
          {!loading && events.length === 0 ? <p className="py-12 text-center text-sm text-black/65">Nenhuma atividade registrada. As próximas ações aparecerão aqui.</p> : null}
          {!loading && events.length > 0 ? <Table><TableHeader><TableRow><TableHead>Data e horário</TableHead><TableHead>Responsável</TableHead><TableHead>Ação</TableHead><TableHead>Detalhes</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id}><TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-black/70">{formatDateTime(event.createdAt)}</TableCell><TableCell className="font-semibold">{event.actorName}</TableCell><TableCell>{actionLabels[event.action] ?? event.action}</TableCell><TableCell className="font-medium text-black/70">{eventDetail(event)}</TableCell><TableCell><Badge className={event.actorType === 'customer' ? 'bg-black text-white' : event.actorType === 'system' ? 'bg-haus-gold/20 text-[#6b451c]' : 'bg-[#e7e1db] text-[#4f3528]'}>{event.actorType === 'customer' ? 'Cliente' : event.actorType === 'system' ? 'Automação' : 'Colaborador'}</Badge></TableCell></TableRow>)}</TableBody></Table> : null}
        </CardContent>
      </Card>
    </div>
  );
}
