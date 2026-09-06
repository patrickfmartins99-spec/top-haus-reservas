import { RefreshCw, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function OfflineModeBanner({
  savedAt,
  onRetry,
  retrying = false,
}: {
  savedAt: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <output className="flex flex-col gap-3 rounded-xl border border-amber-600/35 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">Modo de contingência — somente consulta</p>
          <p className="mt-1 text-sm leading-5">
            Exibindo a última cópia deste aparelho, salva em{' '}
            {new Date(savedAt).toLocaleString('pt-BR')}. Alterações estão
            bloqueadas até a conexão voltar.
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          disabled={retrying}
          onClick={onRetry}
          className="shrink-0 border-amber-700/30 bg-white"
        >
          <RefreshCw className={retrying ? 'animate-spin' : ''} />
          Tentar novamente
        </Button>
      ) : null}
    </output>
  );
}
