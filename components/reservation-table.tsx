'use client';
import { useState } from 'react';
import { Save, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getFirebaseClient } from '@/lib/firebase/client';

export function ReservationTable({
  id,
  initialValue = '',
  customerName,
  disabled = false,
  onSaved,
}: {
  id: string;
  initialValue?: string;
  customerName: string;
  disabled?: boolean;
  onSaved?: (tableLabel: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (busy || disabled || value === saved) return;
    const user = getFirebaseClient()?.auth.currentUser;
    if (!user) {
      setMessage('Entre novamente para salvar.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/reservas/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ action: 'assign_table', tableLabel: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setValue(data.tableLabel);
      setSaved(data.tableLabel);
      setMessage('Mesa salva.');
      onSaved?.(data.tableLabel);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-40 max-w-56">
      <div className="flex gap-1">
        <Input
          disabled={disabled || busy}
          aria-label={`Mesa de ${customerName}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
          placeholder="Ex.: 12 ou 12 + 13"
          maxLength={40}
          className="h-11 bg-white font-semibold"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled || busy || value === saved}
          onClick={save}
          aria-label={`Salvar mesa de ${customerName}`}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
        </Button>
      </div>
      <output className="mt-1 block whitespace-normal text-xs font-medium text-black/75">
        {message || (!saved ? 'Mesa ainda não definida' : '')}
      </output>
    </div>
  );
}
