'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Check, CircleAlert, CloudCheck, LoaderCircle, LockKeyhole } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
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
  const [firebaseStatus, setFirebaseStatus] = useState<'checking' | 'connected' | 'not_configured' | 'error'>('checking');

  useEffect(() => {
    let active = true;
    fetch('/api/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { firebase?: 'connected' | 'not_configured' | 'error' }) => {
        if (active) setFirebaseStatus(data.firebase ?? 'error');
      })
      .catch(() => {
        if (active) setFirebaseStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: React.SyntheticEvent<HTMLFormElement>) {
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
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-black p-12 text-white lg:flex lg:flex-col">
          <div className="absolute -bottom-48 -left-40 size-[34rem] rounded-full border border-haus-gold/15" aria-hidden="true" />
          <div className="absolute -bottom-24 -left-24 size-[24rem] rounded-full border border-haus-gold/15" aria-hidden="true" />
          <BrandLogo priority className="relative rounded-lg" />
          <div className="relative my-auto max-w-lg py-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-haus-gold">Ambiente interno</p>
            <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.04em]">A operação do salão em um só lugar.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-white/80">Reservas, aprovações e fila de espera organizadas para toda a equipe.</p>
            <div className="mt-10 space-y-4 text-sm text-white/85">
              <p className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><Check className="size-4 text-haus-gold" /></span> Acesso individual por colaborador</p>
              <p className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><Check className="size-4 text-haus-gold" /></span> Histórico de alterações e aprovações</p>
              <p className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><Check className="size-4 text-haus-gold" /></span> Experiência preparada para celular e tablet</p>
            </div>
          </div>
          <p className="relative text-xs text-white/60">Top Haus · Sistema de reservas</p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
          <Card className="w-full max-w-md border-0 bg-[#fdfcf9] py-2 shadow-[0_24px_70px_rgba(0,0,0,0.12)] ring-black/5">
            <CardHeader className="pb-3">
              <BrandLogo compact priority className="mb-5 rounded-md lg:hidden" />
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">Acesso do colaborador</p>
              <CardTitle className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">Bem-vindo de volta.</CardTitle>
              <CardDescription className="mt-1 leading-6">Entre com o seu usuário individual para acessar as reservas.</CardDescription>
              <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                firebaseStatus === 'connected'
                  ? 'border-emerald-700/20 bg-emerald-50 text-emerald-800'
                  : firebaseStatus === 'checking'
                    ? 'border-black/10 bg-black/[0.03] text-black/60'
                    : 'border-amber-700/20 bg-amber-50 text-amber-900'
              }`}>
                {firebaseStatus === 'checking' ? <LoaderCircle className="size-4 animate-spin" /> : firebaseStatus === 'connected' ? <CloudCheck className="size-4" /> : <CircleAlert className="size-4" />}
                {firebaseStatus === 'checking'
                  ? 'Verificando conexão com o Firebase...'
                  : firebaseStatus === 'connected'
                    ? 'Firebase conectado e pronto'
                    : firebaseStatus === 'not_configured'
                      ? 'Firebase ainda não configurado no Netlify'
                      : 'Não foi possível acessar o Firebase'}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={signIn} className="space-y-5">
                <div className="space-y-2"><Label htmlFor="username">Usuário</Label><Input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="h-12 bg-white" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Ex.: patrickf" required /></div>
                <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Senha</Label><span className="text-xs text-black/40">Mínimo de 8 caracteres</span></div><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 bg-white" autoComplete="current-password" required /></div>
                {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" disabled={loading} className="h-12 w-full bg-black text-base font-bold text-white hover:bg-black/85">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />} {loading ? 'Entrando...' : 'Entrar no painel'}</Button>
                <p className="text-center text-xs leading-5 text-black/40">Problemas com o acesso? Solicite a redefinição da senha ao administrador.</p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
