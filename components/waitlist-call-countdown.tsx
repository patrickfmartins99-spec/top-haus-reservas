import {
  callHoldState,
  formatDurationClock,
  type WaitlistTiming,
} from '@/lib/domain/waitlist-time';

export function WaitlistCallCountdown({
  entry,
  now,
}: {
  entry: WaitlistTiming;
  now: number;
}) {
  const hold = callHoldState(entry, now);
  if (!hold) return null;
  return (
    <div
      className={`mt-2 rounded-lg border px-3 py-2 text-sm ${hold.expired ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-400 bg-amber-50 text-amber-950'}`}
    >
      <p className="font-bold">
        {hold.expired
          ? 'Prazo de chamada encerrado'
          : `Mesa aguardando por ${formatDurationClock(Math.ceil(hold.remaining / 1000) * 1000).slice(3)}`}
      </p>
      <p className="mt-1 text-xs">
        {hold.expired
          ? 'Confira a presença e registre chegada ou no show. O cliente não é removido automaticamente.'
          : 'Três minutos contados a partir da chamada no painel.'}
      </p>
    </div>
  );
}
