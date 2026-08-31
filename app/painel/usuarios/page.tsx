'use client';

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldCheck,
  UserCog,
  UserRoundCheck,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getFirebaseClient } from '@/lib/firebase/client';

type StaffUser = {
  uid: string;
  username: string;
  displayName: string;
  role: 'admin' | 'staff';
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

async function adminRequest(currentUser: User, url: string, init?: RequestInit) {
  const token = await currentUser.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

export default function StaffUsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = useCallback(async (user: User) => {
    const response = await adminRequest(user, '/api/admin/usuarios');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os colaboradores.');
    setUsers(data.users);
  }, []);

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      setError('Firebase não configurado.');
      setLoading(false);
      return;
    }
    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) {
        router.replace('/entrar');
        return;
      }
      setCurrentUser(user);
      try {
        const token = await user.getIdTokenResult(true);
        if (token.claims.admin !== true) throw new Error('Esta área é exclusiva para administradores.');
        await loadUsers(user);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Acesso não autorizado.');
      } finally {
        setLoading(false);
      }
    });
  }, [loadUsers, router]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await adminRequest(currentUser, '/api/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ displayName, username, password, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível criar o usuário.');
      setDisplayName('');
      setUsername('');
      setPassword('');
      setRole('staff');
      setSuccess('Colaborador criado com sucesso.');
      await loadUsers(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(target: StaffUser, body: object, successMessage: string) {
    if (!currentUser) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await adminRequest(currentUser, `/api/admin/usuarios/${target.uid}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível atualizar o usuário.');
      setSuccess(successMessage);
      setResetTarget(null);
      setNewPassword('');
      await loadUsers(currentUser);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível atualizar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] text-haus-ink"><p className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Carregando acessos...</p></main>;
  }

  return (
    <main className="min-h-screen bg-[#f5f2eb] px-5 py-8 text-haus-ink sm:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.push('/painel')} aria-label="Voltar ao painel"><ArrowLeft /></Button>
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-haus-terracotta">Administração</p><h1 className="font-heading text-3xl font-bold">Usuários da equipe</h1></div>
          </div>
          <Badge className="bg-haus-ink text-white"><ShieldCheck /> Acesso administrativo</Badge>
        </header>

        {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">{error}</p>}
        {success && <p className="flex items-center gap-2 rounded-xl bg-haus-sage/10 px-4 py-3 text-sm font-medium text-haus-sage" role="status"><CheckCircle2 className="size-4" /> {success}</p>}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="h-fit bg-white ring-black/7">
            <CardHeader><CardTitle className="flex items-center gap-2 font-heading text-xl font-bold"><Plus className="size-5 text-haus-terracotta" /> Novo colaborador</CardTitle><p className="text-sm text-haus-ink/50">O e-mail técnico será criado automaticamente e não aparecerá para o colaborador.</p></CardHeader>
            <CardContent>
              <form onSubmit={createUser} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="display-name">Nome completo</Label><Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Patrick Fernandes" className="h-11" minLength={2} required /></div>
                <div className="space-y-2"><Label htmlFor="new-username">Usuário</Label><Input id="new-username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="Ex.: patrickf" className="h-11" pattern="[a-z0-9._-]{3,32}" autoCapitalize="none" required /><p className="text-xs text-haus-ink/45">Letras minúsculas, números, ponto, hífen ou sublinhado.</p></div>
                <div className="space-y-2"><Label htmlFor="new-user-password">Senha inicial</Label><Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" minLength={8} autoComplete="new-password" required /><p className="text-xs text-haus-ink/45">Mínimo de 8 caracteres. A senha não será armazenada no banco.</p></div>
                <div className="space-y-2"><Label htmlFor="role">Permissão</Label><NativeSelect id="role" value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'staff')} className="w-full [&>select]:h-11"><NativeSelectOption value="staff">Colaborador</NativeSelectOption><NativeSelectOption value="admin">Administrador</NativeSelectOption></NativeSelect></div>
                <Button type="submit" disabled={saving} className="h-11 w-full bg-haus-terracotta text-white hover:bg-haus-terracotta/90">{saving ? <LoaderCircle className="animate-spin" /> : <UserRoundCheck />} Criar acesso</Button>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="font-heading text-2xl font-bold">Acessos cadastrados</h2><p className="text-sm text-haus-ink/50">{users.length} {users.length === 1 ? 'usuário' : 'usuários'}</p></div><Users className="size-5 text-haus-ink/35" /></div>
            {users.length === 0 && !error ? <Card className="bg-white py-12 text-center ring-black/7"><CardContent><p className="text-sm text-haus-ink/50">Nenhum colaborador cadastrado.</p></CardContent></Card> : null}
            {users.map((staffUser) => (
              <Card key={staffUser.uid} className="bg-white ring-black/7">
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-haus-ink text-sm font-bold text-white">{staffUser.displayName.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{staffUser.displayName}</h3><Badge className={staffUser.role === 'admin' ? 'bg-haus-gold/20 text-[#775116]' : 'bg-haus-sage/10 text-haus-sage'}>{staffUser.role === 'admin' ? 'Administrador' : 'Colaborador'}</Badge>{staffUser.disabled && <Badge variant="destructive">Bloqueado</Badge>}</div><p className="mt-1 text-sm text-haus-ink/50">Usuário: <strong className="font-mono text-haus-ink/70">{staffUser.username}</strong></p></div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => setResetTarget(staffUser)}><KeyRound /> Senha</Button>
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => updateUser(staffUser, { action: 'set_role', role: staffUser.role === 'admin' ? 'staff' : 'admin' }, staffUser.role === 'admin' ? 'Permissão alterada para colaborador.' : 'Permissão administrativa concedida.')}><UserCog /> {staffUser.role === 'admin' ? 'Tornar colaborador' : 'Tornar admin'}</Button>
                    <Button variant={staffUser.disabled ? 'outline' : 'destructive'} size="sm" disabled={saving} onClick={() => updateUser(staffUser, { action: 'set_disabled', disabled: !staffUser.disabled }, staffUser.disabled ? 'Acesso desbloqueado.' : 'Acesso bloqueado.')}><Ban /> {staffUser.disabled ? 'Desbloquear' : 'Bloquear'}</Button>
                  </div>
                </CardContent>
                {resetTarget?.uid === staffUser.uid && (
                  <div className="border-t border-black/7 bg-black/[0.02] px-4 py-4">
                    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); updateUser(staffUser, { action: 'reset_password', password: newPassword }, 'Senha redefinida com sucesso.'); }}>
                      <div className="flex-1 space-y-2"><Label htmlFor={`password-${staffUser.uid}`}>Nova senha para {staffUser.username}</Label><Input id={`password-${staffUser.uid}`} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div>
                      <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => { setResetTarget(null); setNewPassword(''); }}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-haus-terracotta text-white">Salvar senha</Button></div>
                    </form>
                  </div>
                )}
              </Card>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
