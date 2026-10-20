'use client';

import { useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from '@/components/reason-dialog';
import { RESERVATION_CANCELLATION_REASONS } from '@/lib/domain/service-outcomes';
import { getFirebaseClient } from '@/lib/firebase/client';

export function ReservationApproval({
  id,
  customerName,
  onChanged,
}: {
  id: string;
  customerName: string;
  onChanged: (id: string, status: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function decide(
    status: 'confirmed' | 'cancelled',
    reason?: string,
    note?: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const user = getFirebaseClient()?.auth.currentUser;
      if (!user) throw new Error('Entre novamente para registrar sua decisão.');
      const response = await fetch(`/api/reservas/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ action: 'set_status', status, reason, note }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? 'Não foi possível registrar a decisão.');
      setRefusing(false);
      onChanged(id, data.status);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Confira sua conexão e tente novamente.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-950">
        Esta solicitação precisa de uma decisão da equipe.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={busy}
          onClick={() => void decide('confirmed')}
          className="min-h-11 bg-emerald-800 text-white hover:bg-emerald-900"
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Check />} Aprovar
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          className="min-h-11 border-red-300 text-red-800"
          onClick={() => {
            setError('');
            setRefusing(true);
          }}
        >
          <X /> Recusar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <ReasonDialog
        open={refusing}
        title={`Recusar a solicitação de ${customerName}?`}
        description={
          error ||
          'Registre o motivo. Os lugares serão liberados e a comunicação de cancelamento será gerada.'
        }
        options={RESERVATION_CANCELLATION_REASONS}
        confirmLabel="Registrar recusa"
        busy={busy}
        onOpenChange={setRefusing}
        onConfirm={(reason, note) => decide('cancelled', reason, note)}
      />
    </div>
  );
}
