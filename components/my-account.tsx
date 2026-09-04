'use client';
import { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from 'firebase/auth';
import { AccountEditor, type AccountDraft } from '@/components/account-editor';
import { useStaffSession } from '@/components/staff-session';
import { getFirebaseClient } from '@/lib/firebase/client';
import { removeStaffPush } from '@/components/staff-push-controls';
export function MyAccount() {
  const { profile, refresh } = useStaffSession(),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(''),
    [version, setVersion] = useState(0);
  if (!profile) return null;
  async function save(draft: AccountDraft, currentPassword: string) {
    const user = getFirebaseClient()?.auth.currentUser;
    if (!user || !profile) throw new Error('Entre novamente.');
    setBusy(true);
    setSuccess('');
    try {
      if (draft.username !== profile.username || draft.password) {
        if (!user.email) throw new Error('Acesso indisponível.');
        await reauthenticateWithCredential(
          user,
          EmailAuthProvider.credential(user.email, currentPassword),
        );
      }
      const response = await fetch('/api/conta', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (await user.getIdToken(true)),
        },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.signInAgain) {
        try {
          await removeStaffPush();
        } catch {}
        await signOut(getFirebaseClient()!.auth);
        window.location.assign('/entrar');
        return;
      }
      await user.reload();
      await refresh();
      setVersion((v) => v + 1);
      setSuccess('Sua conta foi atualizada.');
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code?.startsWith('auth/'))
        throw new Error(
          'Não foi possível confirmar sua senha atual. Confira e tente novamente.',
        );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white p-5 ring-1 ring-black/10 sm:p-7">
      <div>
        <h2 className="text-2xl font-bold">Minha conta</h2>
        <p className="mt-2 text-sm text-black/70">
          Seu perfil, sua foto e seus dados de acesso. Cargo:{' '}
          <strong>
            {profile.role === 'admin' ? 'Administrador' : 'Colaborador'}
          </strong>
          .
        </p>
      </div>
      {success && (
        <output className="block rounded-lg bg-[#f4e7d7] p-3">{success}</output>
      )}
      <AccountEditor
        key={version}
        self
        initial={{
          displayName: profile.displayName,
          username: profile.username,
          photo: profile.photo,
          password: '',
          confirmPassword: '',
        }}
        busy={busy}
        onSave={save}
      />
    </section>
  );
}
