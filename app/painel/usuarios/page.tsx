'use client';
import { useEffect, useState } from 'react';
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { AccountEditor, type AccountDraft } from '@/components/account-editor';
import { useStaffSession } from '@/components/staff-session';
import { getFirebaseClient } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
type Person = {
  uid: string;
  displayName: string;
  username: string;
  role: 'admin' | 'staff';
  disabled: boolean;
  photo?: string;
};
export default function StaffUsersPage() {
  const { profile } = useStaffSession(),
    [users, setUsers] = useState<Person[]>([]),
    [editing, setEditing] = useState<Person | 'new' | null>(null),
    [deleting, setDeleting] = useState<Person | null>(null),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [loading, setLoading] = useState(true);
  async function request(url: string, method = 'GET', body?: unknown) {
    const user = getFirebaseClient()?.auth.currentUser;
    if (!user) throw new Error('Entre novamente.');
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + (await user.getIdToken()),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function refresh() {
    const d = await request('/api/admin/usuarios');
    setUsers(d.users);
  }
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    const timer = setTimeout(() => {
      void refresh()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [profile?.role]);
  async function save(draft: AccountDraft, currentPassword: string) {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      if (
        editing !== 'new' &&
        editing.uid === profile?.uid &&
        (draft.password || draft.username !== editing.username)
      ) {
        const u = getFirebaseClient()!.auth.currentUser!;
        await reauthenticateWithCredential(
          u,
          EmailAuthProvider.credential(u.email!, currentPassword),
        );
      }
      const d = await request(
        '/api/admin/usuarios' + (editing === 'new' ? '' : '/' + editing.uid),
        editing === 'new' ? 'POST' : 'PATCH',
        draft,
      );
      if (d.signInAgain) {
        await signOut(getFirebaseClient()!.auth);
        window.location.assign('/entrar');
        return;
      }
      setEditing(null);
      await refresh();
      setSuccess('Acesso salvo com sucesso.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/admin/usuarios/' + deleting.uid, 'DELETE', {
        confirmUsername: confirm,
      });
      setDeleting(null);
      setConfirm('');
      await refresh();
      setSuccess(
        'Acesso excluído. O histórico de atendimentos foi preservado.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }
  if (profile?.role !== 'admin') return null;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-haus-terracotta">
            Administração
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Usuários da equipe</h1>
          <p className="mt-2 text-sm text-black/70">
            Gerencie nomes, acesso, fotos, senhas e cargos.
          </p>
        </div>
        <Button
          className="bg-black text-white"
          onClick={() => {
            setError('');
            setEditing('new');
          }}
        >
          Novo usuário
        </Button>
      </header>
      {error && !deleting && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {success && (
        <output className="block rounded-xl bg-[#f4e7d7] p-4">{success}</output>
      )}
      {loading ? (
        <p>Carregando acessos…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((u) => (
            <article
              key={u.uid}
              className="min-w-0 space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/10"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-black font-bold text-white">
                  {u.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold">
                    {u.displayName}
                    {u.uid === profile.uid ? ' (você)' : ''}
                  </h2>
                  <p className="break-all text-sm text-black/75">
                    @{u.username}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-[#f4e7d7] px-3 py-1">
                  {u.role === 'admin' ? 'Administrador' : 'Colaborador'}
                </span>
                <span
                  className={
                    'rounded-full px-3 py-1 ' +
                    (u.disabled
                      ? 'bg-red-100 text-red-800'
                      : 'bg-black text-white')
                  }
                >
                  {u.disabled ? 'Bloqueado' : 'Ativo'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    setError('');
                    try {
                      const data = await request(
                        '/api/admin/usuarios/' + u.uid,
                      );
                      setEditing({ ...u, photo: data.photo });
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Falha ao abrir usuário.',
                      );
                    }
                  }}
                >
                  Editar usuário
                </Button>
                <Button
                  variant="outline"
                  className="text-red-700"
                  disabled={u.uid === profile.uid}
                  onClick={() => {
                    setError('');
                    setConfirm('');
                    setDeleting(u);
                  }}
                >
                  Excluir usuário
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? 'Criar usuário' : 'Editar usuário'}
            </DialogTitle>
            <DialogDescription>
              Alterações ficam registradas na auditoria. Mudanças de acesso
              podem exigir novo login.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AccountEditor
              key={editing === 'new' ? 'new' : editing.uid}
              admin
              creating={editing === 'new'}
              self={editing !== 'new' && editing.uid === profile.uid}
              busy={busy}
              initial={
                editing === 'new'
                  ? {
                      displayName: '',
                      username: '',
                      password: '',
                      confirmPassword: '',
                      role: 'staff',
                    }
                  : {
                      displayName: editing.displayName,
                      username: editing.username,
                      password: '',
                      confirmPassword: '',
                      role: editing.role,
                      disabled: editing.disabled,
                      photo: editing.photo,
                    }
              }
              onSave={save}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {deleting?.displayName}?</DialogTitle>
            <DialogDescription>
              O acesso será removido definitivamente. Reservas e auditoria
              permanecem. Para confirmar, digite o usuário: {deleting?.username}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Confirmar usuário para exclusão"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirm !== deleting?.username}
              onClick={remove}
            >
              Confirmar exclusão
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
