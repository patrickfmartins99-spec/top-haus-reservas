'use client';
import type { ReactNode } from 'react';
import { ReservationTable } from '@/components/reservation-table';
type Item = {
  id: string;
  customerName: string;
  partySize: number;
  service: string;
  serviceDate: string;
  arrivalTime: string;
  status: string;
  tableLabel: string;
  whatsapp?: string;
  notes?: string;
};
const labels: Record<string, string> = {
  pending_approval: 'Aguardando aprovação',
  confirmed: 'Confirmada',
  presence_confirmed: 'Presença confirmada',
  seated: 'Cliente chegou',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
  completed: 'Concluída',
};
export function ReservationCards({
  items,
  actions,
}: {
  items: Item[];
  actions?: (item: Item) => ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {items.map((r) => (
        <article
          key={r.id}
          className="min-w-0 space-y-4 rounded-2xl border border-black/12 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.09)] transition-shadow hover:shadow-[0_14px_36px_rgba(0,0,0,0.13)] sm:p-5"
          aria-label={'Reserva de ' + r.customerName}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-xl font-extrabold leading-tight">
                {r.customerName}
              </h3>
              <p className="mt-1 text-sm font-medium text-black/70">
                {r.service === 'almoco' ? 'Almoço' : 'Rodízio'} ·{' '}
                {r.serviceDate.split('-').reverse().join('/')}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-black px-3 py-2 text-lg font-extrabold text-white">
              {r.arrivalTime}
            </span>
          </header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f4e7d7] px-3 py-1.5 text-sm font-bold">
              {r.partySize} {r.partySize === 1 ? 'pessoa' : 'pessoas'}
            </span>
            <span
              className={
                'rounded-full px-3 py-1.5 text-sm font-bold ' +
                (r.status === 'pending_approval'
                  ? 'bg-amber-100 text-amber-900'
                  : ['cancelled', 'no_show'].includes(r.status)
                    ? 'bg-red-100 text-red-800'
                    : 'bg-stone-100 text-stone-800')
              }
            >
              {labels[r.status] ?? r.status}
            </span>
          </div>
          {r.whatsapp && (
            <p className="break-all text-sm text-black/80">
              <strong>WhatsApp:</strong> {r.whatsapp}
            </p>
          )}
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-700">
              Mesa da reserva
            </p>
            <ReservationTable
              id={r.id}
              initialValue={r.tableLabel}
              customerName={r.customerName}
            />
          </div>
          {r.notes && (
            <p className="whitespace-pre-wrap break-words text-sm text-black/80">
              <strong>Observações:</strong> {r.notes}
            </p>
          )}
          <details className="text-sm text-black/80">
            <summary className="cursor-pointer font-semibold">
              Código da reserva
            </summary>
            <p className="mt-2 break-all rounded-lg bg-stone-100 px-3 py-2 font-mono font-semibold text-black">
              {r.id}
            </p>
          </details>
          {actions && (
            <div className="flex flex-wrap gap-2 border-t border-black/10 pt-3">
              {actions(r)}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
