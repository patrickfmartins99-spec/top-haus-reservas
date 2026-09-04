'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
export type AccountDraft = {
  displayName: string;
  username: string;
  password: string;
  confirmPassword: string;
  photo?: string;
  role?: 'admin' | 'staff';
  disabled?: boolean;
};
export function AccountEditor({
  initial,
  admin = false,
  creating = false,
  self = false,
  busy,
  onSave,
}: {
  initial: AccountDraft;
  admin?: boolean;
  creating?: boolean;
  self?: boolean;
  busy: boolean;
  onSave: (draft: AccountDraft, currentPassword: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial),
    [currentPassword, setCurrentPassword] = useState(''),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false);
  const edit = (key: keyof AccountDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function photo(file?: File) {
    if (!file) return;
    setReading(true);
    setError('');
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error('Escolha JPG, PNG ou WebP de até 5 MB.');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível preparar a foto.');
      const size = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - size) / 2,
        (bitmap.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      bitmap.close();
      edit('photo', canvas.toDataURL('image/jpeg', 0.8));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Não foi possível carregar a foto.',
      );
    } finally {
      setReading(false);
    }
  }
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        if (
          (creating && !draft.password) ||
          draft.password !== draft.confirmPassword
        ) {
          setError('As senhas precisam ser iguais.');
          return;
        }
        try {
          await onSave(draft, currentPassword);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
        }
      }}
    >
      <fieldset
        disabled={busy || reading}
        className="space-y-5 disabled:opacity-60"
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-black text-xl font-bold text-white">
            {draft.photo ? (
              <Image
                unoptimized
                width={80}
                height={80}
                src={draft.photo}
                alt="Prévia da foto de perfil"
                className="size-full object-cover"
              />
            ) : (
              draft.displayName.slice(0, 2).toUpperCase() || 'TH'
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="profile-photo">Foto de perfil</Label>
            <Input
              id="profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void photo(e.target.files?.[0])}
              className="max-w-full"
            />
            <p className="text-xs text-black/70">
              JPG, PNG ou WebP, até 5 MB. Recorte quadrado automático.
            </p>
            {draft.photo && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => edit('photo', '')}
              >
                Remover foto
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-name">Nome de exibição</Label>
            <Input
              id="account-name"
              value={draft.displayName}
              minLength={2}
              maxLength={80}
              required
              onChange={(e) => edit('displayName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-username">Nome de usuário</Label>
            <Input
              id="account-username"
              value={draft.username}
              pattern="[a-z0-9._-]{3,32}"
              autoCapitalize="none"
              autoComplete="username"
              required
              onChange={(e) => edit('username', e.target.value.toLowerCase())}
            />
            <p className="text-xs text-black/70">
              É o nome usado para entrar no painel.
            </p>
          </div>
        </div>
        {admin && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-role">Cargo</Label>
              <NativeSelect
                id="account-role"
                value={draft.role ?? 'staff'}
                disabled={self}
                onChange={(e) => edit('role', e.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="staff">
                  Colaborador
                </NativeSelectOption>
                <NativeSelectOption value="admin">
                  Administrador
                </NativeSelectOption>
              </NativeSelect>
              {self && (
                <p className="text-xs text-black/70">
                  Outro administrador pode alterar seu cargo.
                </p>
              )}
            </div>
            {!creating && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={self}
                  checked={Boolean(draft.disabled)}
                  onChange={(e) => edit('disabled', e.target.checked)}
                />{' '}
                Bloquear acesso
              </label>
            )}
          </div>
        )}
        <div className="rounded-xl border border-black/15 p-4">
          <h3 className="font-bold">
            {creating ? 'Senha de acesso' : 'Alterar senha'}
          </h3>
          {!creating && (
            <p className="mt-1 text-sm text-black/70">
              Deixe os dois campos vazios para manter a senha atual.
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-password">
                {creating ? 'Senha inicial' : 'Nova senha'}
              </Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                required={creating}
                minLength={8}
                maxLength={128}
                onChange={(e) => edit('password', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm">Confirmar senha</Label>
              <Input
                id="account-confirm"
                type="password"
                autoComplete="new-password"
                value={draft.confirmPassword}
                required={creating || Boolean(draft.password)}
                minLength={8}
                maxLength={128}
                onChange={(e) => edit('confirmPassword', e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-black/70">
            Mínimo de 8 caracteres. Nunca exibimos nem registramos sua senha na
            auditoria.
          </p>
        </div>
        {self && (draft.username !== initial.username || draft.password) && (
          <div className="space-y-2">
            <Label htmlFor="current-password">Sua senha atual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <p className="text-xs text-black/70">
              Confirme sua identidade. Após a alteração, entre novamente com os
              novos dados.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full bg-black text-white sm:w-auto">
          {busy
            ? 'Salvando…'
            : reading
              ? 'Preparando foto…'
              : creating
                ? 'Criar acesso'
                : 'Salvar alterações'}
        </Button>
      </fieldset>
    </form>
  );
}
