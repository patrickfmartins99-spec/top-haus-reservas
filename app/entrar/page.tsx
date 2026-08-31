'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LockKeyhole, UtensilsCrossed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getFirebaseClient, isFirebaseConfigured } from '@/lib/firebase/client';
import { isValidUsername, staffEmailFromUsername } from '@/lib/auth/staff-identity';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFirebaseConfigured) {
      setError('Conecte o projeto Firebase para habilitar o acesso dos colaboradores.');
      return;
    }
    if (!isValidUsername(username)) {
      setError('Informe um usuário válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const firebase = getFirebaseClient();
      if (!firebase) throw new Error('Firebase indisponível.');
      await signInWithEmailAndPassword(firebase.auth, staffEmailFromUsername(username), password);
      router.push('/painel');
    } catch {
      setError('Usuário ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-haus-ink px-5 py-10 text-haus-ink">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true"><div className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-haus-gold/10" /><div className="absolute left-1/2 top-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-haus-gold/10" /></div>
      <Card className="relative w-full max-w-md bg-[#fffdf8] py-2 shadow-2xl ring-0">
        <CardHeader className="items-center pb-2 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-full bg-haus-ink text-haus-gold"><UtensilsCrossed className="size-5" /></span>
          <CardTitle className="font-heading text-2xl font-bold">Acesso da equipe</CardTitle>
          <CardDescription>Entre com o seu usuário individual do Top Haus.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="username">Usuário</Label><Input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="h-11 bg-white" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Ex.: patrickf" required /></div>
            <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 bg-white" required /></div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full bg-haus-terracotta text-white hover:bg-haus-terracotta/90"><LockKeyhole className="size-4" /> {loading ? 'Entrando...' : 'Entrar no painel'}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
