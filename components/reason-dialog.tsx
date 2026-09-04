'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { OutcomeReason } from '@/lib/domain/service-outcomes';

type ReasonDialogProps = {
  open: boolean;
  title: string;
  description: string;
  options: OutcomeReason[];
  confirmLabel: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, note: string) => Promise<void> | void;
};

export function ReasonDialog({
  open,
  title,
  description,
  options,
  confirmLabel,
  busy = false,
  onOpenChange,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setError('Selecione um motivo para continuar.');
      return;
    }
    if (reason === 'other' && note.trim().length < 3) {
      setError('Descreva o outro motivo.');
      return;
    }
    setError('');
    await onConfirm(reason, note.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-black/70">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-2">
              <Label htmlFor="outcome-reason">Motivo</Label>
              <NativeSelect
                id="outcome-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError('');
                }}
                className="w-full"
                required
              >
                <NativeSelectOption value="">
                  Selecione um motivo
                </NativeSelectOption>
                {options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="outcome-note">
                Detalhes {reason === 'other' ? '(obrigatório)' : '(opcional)'}
              </Label>
              <Textarea
                id="outcome-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="Acrescente uma informação útil para o relatório."
                required={reason === 'other'}
              />
            </div>
            {error ? (
              <p
                className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
