'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  History,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  LoaderCircle,
  LogOut,
  Settings,
  UserCog,
} from 'lucide-react';

import { StaffPushControls, removeStaffPush } from '@/components/staff-push-controls';
import { BrandLogo } from '@/components/brand-logo';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { getFirebaseClient } from '@/lib/firebase/client';

const navigation = [
  { icon: LayoutDashboard, label: 'Visão geral', href: '/painel' },
  { icon: CalendarDays, label: 'Reservas', href: '/painel/reservas' },
  { icon: ListOrdered, label: 'Fila de espera', href: '/painel/fila' },
  { icon: MessageCircle, label: 'Mensagens', href: '/painel/mensagens' },
  { icon: History, label: 'Auditoria', href: '/painel/auditoria' },
  { icon: UserCog, label: 'Usuários', href: '/painel/usuarios' },
  { icon: Settings, label: 'Configurações', href: '/painel/configuracoes' },
];

function isActive(pathname: string, href: string) {
  if (href === '/painel') return pathname === href;
  return pathname.startsWith(href);
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [displayName, setDisplayName] = useState('Colaborador');
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; description: string; href: string }>>([]);

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => setCheckingSession(false), 0);
      return () => window.clearTimeout(timeout);
    }

    return onAuthStateChanged(firebase.auth, (user) => {
      if (!user) {
        router.replace('/entrar');
        return;
      }
      setDisplayName(user.displayName || 'Colaborador');
      setCheckingSession(false);
    });
  }, [router]);

  async function loadNotifications() {
    const firebase = getFirebaseClient();
    const user = firebase?.auth.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notificacoes', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (response.ok) setNotifications(data.items);
    } catch {
      // A central continua utilizável mesmo se a atualização silenciosa falhar.
    }
  }

  useEffect(() => {
    if (checkingSession) return;
    const initial = window.setTimeout(() => { void loadNotifications(); }, 0);
    const interval = window.setInterval(() => { void loadNotifications(); }, 60000);
    const refresh = () => { void loadNotifications(); };
    window.addEventListener('focus', refresh);
    navigator.serviceWorker?.addEventListener('message', refresh);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', refresh); navigator.serviceWorker?.removeEventListener('message', refresh); };
  }, [checkingSession, pathname]);

  async function handleLogout() {
    const firebase = getFirebaseClient();
    if (!firebase) {
      router.replace('/entrar');
      return;
    }
    setLoggingOut(true);
    try { await removeStaffPush(); } catch { /* Sign-out must remain available if the push service is offline. */ }
    await signOut(firebase.auth);
    router.replace('/entrar');
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#efede8] text-haus-ink">
        <p className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="size-4 animate-spin" /> Abrindo o painel...</p>
      </main>
    );
  }

  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TH';

  return (
    <main className="min-h-screen bg-[#efede8] text-haus-ink">
      <div className="grid min-h-screen lg:grid-cols-[252px_1fr]">
        <aside className="hidden border-r border-white/10 bg-black px-4 py-6 text-white lg:flex lg:flex-col">
          <Link href="/painel" className="flex items-center gap-3 px-2" aria-label="Ir para a visão geral">
            <BrandLogo compact priority className="rounded-md" />
            <div className="border-l border-white/25 pl-3"><p className="text-sm font-bold">Reservas</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/70">Equipe</p></div>
          </Link>

          <nav className="mt-10 space-y-1 text-sm" aria-label="Navegação principal">
            {navigation.map(({ icon: Icon, label, href }) => {
              const active = isActive(pathname, href);
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${active ? 'bg-[#8c4b28] text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                  <Icon className="size-4" />{label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/15 pt-4">
            <button onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50">
              {loggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />} Sair
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex h-20 items-center justify-between border-b border-black/7 bg-white px-5 sm:px-8">
            <div><p className="text-xs font-medium text-haus-ink/45">Painel da equipe</p><p className="font-heading text-xl font-bold">Top Haus Reservas</p></div>
            <div className="flex items-center gap-2">
              <button onClick={handleLogout} disabled={loggingOut} aria-label="Sair da conta" className="rounded-lg p-2 lg:hidden"><LogOut className="size-4" /></button>
              <Popover>
                <PopoverTrigger onClick={() => void loadNotifications()} className={`${buttonVariants({ variant: 'outline', size: 'icon' })} relative`} aria-label={`Notificações: ${notifications.length}`}>
                  <Bell className="size-4" />
                  {notifications.length ? <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-haus-terracotta px-1 text-[9px] font-bold text-white">{notifications.length > 9 ? '9+' : notifications.length}</span> : null}
                </PopoverTrigger>
                <PopoverContent align="end" className="max-h-[85vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0">
                  <PopoverHeader className="border-b border-black/8 p-4"><PopoverTitle className="font-bold">Notificações</PopoverTitle><p className="text-xs text-black/60">Atualizações e pendências do atendimento.</p></PopoverHeader>
                  <div className="p-3"><StaffPushControls /></div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {!notifications.length ? <p className="py-8 text-center text-xs text-black/60">Tudo em dia por aqui.</p> : null}
                    {notifications.map((item) => <Link key={item.id} href={item.href} className="block rounded-lg p-3 transition hover:bg-black/5"><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs leading-5 text-black/65">{item.description}</p></Link>)}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="hidden items-center gap-2 rounded-lg border border-black/8 px-3 py-2 text-sm sm:flex"><span className="grid size-7 place-items-center rounded-full bg-haus-terracotta text-xs font-bold text-white">{initials}</span><span className="max-w-36 truncate">{displayName}</span><ChevronDown className="size-3 text-black/40" /></div>
            </div>
          </header>

          <nav className="flex gap-2 overflow-x-auto border-b border-black/7 bg-white px-5 pb-3 lg:hidden" aria-label="Navegação do painel">
            {navigation.map(({ label, href }) => {
              const active = isActive(pathname, href);
              return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${active ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}>{label}</Link>;
            })}
          </nav>

          {children}
        </section>
      </div>
    </main>
  );
}
