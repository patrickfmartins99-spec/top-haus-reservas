'use client';
import Image from 'next/image';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardCheck,
  History,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  LoaderCircle,
  LogOut,
  Menu,
  Settings,
  UserCog,
} from 'lucide-react';

import {
  StaffPushControls,
  removeStaffPush,
} from '@/components/staff-push-controls';
import { StaffSession, type StaffProfile } from '@/components/staff-session';
import { BrandLogo } from '@/components/brand-logo';
import { buttonVariants } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getFirebaseClient } from '@/lib/firebase/client';

const navigation = [
  { icon: LayoutDashboard, label: 'Painel geral', href: '/painel' },
  { icon: ClipboardCheck, label: 'Pendências', href: '/painel/pendencias' },
  { icon: CalendarDays, label: 'Reservas', href: '/painel/reservas' },
  { icon: ListOrdered, label: 'Fila de espera', href: '/painel/fila' },
  {
    icon: ChartNoAxesCombined,
    label: 'Relatórios',
    href: '/painel/relatorios',
  },
  { icon: MessageCircle, label: 'Mensagens', href: '/painel/mensagens' },
  { icon: History, label: 'Auditoria', href: '/painel/auditoria' },
  { icon: UserCog, label: 'Usuários', href: '/painel/usuarios' },
  { icon: CalendarRange, label: 'Datas especiais', href: '/painel/calendario' },
  { icon: Settings, label: 'Configurações', href: '/painel/configuracoes' },
];

const mobilePrimaryNavigation = [
  { icon: LayoutDashboard, label: 'Hoje', href: '/painel' },
  { icon: ClipboardCheck, label: 'Pendências', href: '/painel/pendencias' },
  { icon: CalendarDays, label: 'Reservas', href: '/painel/reservas' },
  { icon: ListOrdered, label: 'Fila', href: '/painel/fila' },
];

function isActive(pathname: string, href: string) {
  if (href === '/painel') return pathname === href;
  return pathname.startsWith(href);
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [sessionError, setSessionError] = useState('');
  async function refreshProfile() {
    const user = getFirebaseClient()?.auth.currentUser;
    if (!user) return;
    const response = await fetch('/api/conta', {
      headers: { Authorization: 'Bearer ' + (await user.getIdToken()) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setProfile(data.profile);
    setDisplayName(data.profile.displayName);
  }
  const [displayName, setDisplayName] = useState('Colaborador');
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      href: string;
      workflowStatus?: string;
      workflowActorName?: string;
    }>
  >([]);

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => setCheckingSession(false), 0);
      return () => window.clearTimeout(timeout);
    }

    return onAuthStateChanged(firebase.auth, async (user) => {
      if (!user) {
        router.replace('/entrar');
        return;
      }
      try {
        await refreshProfile();
      } catch {
        setSessionError(
          'Não foi possível verificar seu acesso. Atualize a página ou entre novamente.',
        );
      }
      setCheckingSession(false);
    });
  }, [router]);

  async function loadNotifications() {
    const firebase = getFirebaseClient();
    const user = firebase?.auth.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/pendencias', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setNotifications(data.items);
    } catch {
      // A central continua utilizável mesmo se a atualização silenciosa falhar.
    }
  }

  useEffect(() => {
    if (checkingSession) return;
    const firebase = getFirebaseClient();
    const initial = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 300000);
    const refresh = () => {
      void loadNotifications();
    };
    let receivedInitialSnapshot = false;
    const stopRealtime = firebase
      ? onSnapshot(
          query(
            collection(firebase.db, 'staffNotifications'),
            orderBy('createdAt', 'desc'),
            limit(1),
          ),
          (snapshot) => {
            if (
              receivedInitialSnapshot &&
              snapshot.docChanges().some((change) => change.type === 'added')
            ) {
              refresh();
            }
            receivedInitialSnapshot = true;
          },
          () => {
            // O intervalo e o foco continuam como contingência se a conexão cair.
          },
        )
      : () => {};
    window.addEventListener('focus', refresh);
    navigator.serviceWorker?.addEventListener('message', refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      navigator.serviceWorker?.removeEventListener('message', refresh);
      stopRealtime();
    };
  }, [checkingSession]);

  async function handleLogout() {
    const firebase = getFirebaseClient();
    if (!firebase) {
      router.replace('/entrar');
      return;
    }
    setLoggingOut(true);
    try {
      await removeStaffPush();
    } catch {
      /* Sign-out must remain available if the push service is offline. */
    }
    await signOut(firebase.auth);
    router.replace('/entrar');
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#efede8] text-haus-ink">
        <p className="flex items-center gap-2 text-sm font-medium">
          <LoaderCircle className="size-4 animate-spin" /> Abrindo o painel...
        </p>
      </main>
    );
  }

  if (sessionError || !profile)
    return (
      <div className="p-8">
        <p role="alert">{sessionError || 'Acesso indisponível.'}</p>
        <button onClick={handleLogout}>Voltar à entrada</button>
      </div>
    );
  const adminOnly = [
    '/painel/usuarios',
    '/painel/auditoria',
    '/painel/relatorios',
    '/painel/calendario',
  ];
  if (
    profile.role !== 'admin' &&
    adminOnly.some((path) => pathname.startsWith(path))
  )
    return (
      <div className="p-8">
        <p>Área exclusiva do administrador.</p>
        <Link href="/painel">Voltar às reservas de hoje</Link>
      </div>
    );
  const visibleNavigation = navigation.filter(
    (item) =>
      profile.role === 'admin' ||
      [
        '/painel',
        '/painel/pendencias',
        '/painel/reservas',
        '/painel/fila',
      ].includes(item.href),
  );
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'TH';
  const currentPageLabel =
    visibleNavigation.find((item) => isActive(pathname, item.href))?.label ??
    'Painel da equipe';
  const adminMoreNavigation = visibleNavigation.filter(
    (item) =>
      !mobilePrimaryNavigation.some((primary) => primary.href === item.href),
  );
  const adminMoreActive = adminMoreNavigation.some((item) =>
    isActive(pathname, item.href),
  );

  return (
    <StaffSession.Provider value={{ profile, refresh: refreshProfile }}>
      <main className="min-h-screen bg-[#efede8] text-haus-ink">
        <div className="grid min-h-screen lg:grid-cols-[252px_1fr]">
          <aside className="hidden border-r border-white/10 bg-black px-4 py-6 text-white lg:flex lg:flex-col">
            <Link
              href="/painel"
              className="flex items-center gap-3 px-2"
              aria-label="Ir para a visão geral"
            >
              <BrandLogo compact priority className="rounded-md" />
              <div className="border-l border-white/25 pl-3">
                <p className="text-sm font-bold">Reservas</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/70">
                  Equipe
                </p>
              </div>
            </Link>

            <nav
              className="mt-10 space-y-1 text-sm"
              aria-label="Navegação principal"
            >
              {visibleNavigation.map(({ icon: Icon, label, href }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${active ? 'bg-[#8c4b28] text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/15 pt-4">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {loggingOut ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}{' '}
                Sair
              </button>
            </div>
          </aside>

          <section className="min-w-0 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
            <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/7 bg-white/95 px-4 shadow-[0_3px_14px_rgba(0,0,0,0.04)] backdrop-blur sm:px-6 lg:h-20 lg:px-8 lg:shadow-none">
              <div>
                <p className="hidden text-xs font-medium text-haus-ink/45 lg:block">
                  Painel da equipe
                </p>
                <p className="hidden font-heading text-xl font-bold lg:block">
                  Top Haus Reservas
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-haus-terracotta lg:hidden">
                  Top Haus Reservas
                </p>
                <p className="max-w-[11rem] truncate text-base font-extrabold leading-tight sm:max-w-none lg:hidden">
                  {currentPageLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    onClick={() => void loadNotifications()}
                    className={`${buttonVariants({ variant: 'outline', size: 'icon' })} relative`}
                    aria-label={`Notificações: ${notifications.length}`}
                  >
                    <Bell className="size-4" />
                    {notifications.length ? (
                      <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-haus-terracotta px-1 text-[9px] font-bold text-white">
                        {notifications.length > 9 ? '9+' : notifications.length}
                      </span>
                    ) : null}
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="max-h-[85vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0"
                  >
                    <PopoverHeader className="border-b border-black/8 p-4">
                      <PopoverTitle className="font-bold">
                        Notificações
                      </PopoverTitle>
                      <p className="text-xs text-black/60">
                        Atualizações e pendências do atendimento.
                      </p>
                    </PopoverHeader>
                    <div className="p-3">
                      <StaffPushControls />
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {!notifications.length ? (
                        <p className="py-8 text-center text-xs text-black/60">
                          Tudo em dia por aqui.
                        </p>
                      ) : null}
                      {notifications.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="block rounded-lg p-3 transition hover:bg-black/5"
                        >
                          <p className="text-sm font-bold">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-black/65">
                            {item.description}
                          </p>
                          {item.workflowStatus === 'claimed' ? (
                            <p className="mt-2 text-xs font-bold text-[#7b571d]">
                              Assumida por {item.workflowActorName}
                            </p>
                          ) : null}
                        </Link>
                      ))}
                      {notifications.length ? (
                        <Link
                          href="/painel/pendencias"
                          className="mt-2 block rounded-lg bg-black px-3 py-2.5 text-center text-sm font-bold text-white"
                        >
                          Abrir central de pendências
                        </Link>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
                <Link
                  href="/painel/configuracoes"
                  aria-label="Configurações da minha conta"
                  className="flex items-center gap-2 rounded-xl border border-black/15 p-1.5 sm:p-2"
                >
                  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-haus-terracotta text-xs font-bold text-white">
                    {profile.photo ? (
                      <Image
                        unoptimized
                        width={32}
                        height={32}
                        src={profile.photo}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <span className="hidden max-w-24 truncate text-sm md:inline">
                    {displayName}
                  </span>
                  <Settings className="hidden size-4 sm:block" />
                </Link>
              </div>
            </header>

            {children}
          </section>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.10)] backdrop-blur lg:hidden"
          aria-label="Navegação principal no celular"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-1.5 pt-1.5">
            {mobilePrimaryNavigation.map(({ icon: Icon, label, href }) => {
              const active = isActive(pathname, href);
              const showBadge = href === '/painel/pendencias' && notifications.length > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[9px] font-bold transition active:scale-[0.97] min-[360px]:px-1 min-[360px]:text-[10px] ${active ? 'bg-[#f1e5dc] text-haus-terracotta' : 'text-black/60'}`}
                >
                  <span className="relative">
                    <Icon className="size-5" strokeWidth={active ? 2.6 : 2} />
                    {showBadge ? (
                      <span className="absolute -right-2 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-haus-terracotta px-1 text-[8px] font-extrabold text-white">
                        {notifications.length > 9 ? '9+' : notifications.length}
                      </span>
                    ) : null}
                  </span>
                  <span className="whitespace-nowrap leading-none">{label}</span>
                </Link>
              );
            })}

            {profile.role === 'admin' ? (
              <Popover>
                <PopoverTrigger
                  aria-label="Abrir mais opções"
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[9px] font-bold transition active:scale-[0.97] min-[360px]:px-1 min-[360px]:text-[10px] ${adminMoreActive ? 'bg-[#f1e5dc] text-haus-terracotta' : 'text-black/60'}`}
                >
                  <Menu className="size-5" strokeWidth={adminMoreActive ? 2.6 : 2} />
                  Mais
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={10}
                  className="w-[min(21rem,calc(100vw-1rem))] p-2"
                >
                  <PopoverHeader className="px-2 pb-2 pt-1">
                    <PopoverTitle className="font-bold">Mais opções</PopoverTitle>
                    <p className="text-xs text-black/60">
                      Administração e configurações da conta.
                    </p>
                  </PopoverHeader>
                  <div className="grid grid-cols-2 gap-1">
                    {adminMoreNavigation.map(
                      ({ icon: Icon, label, href }) => {
                        const active = isActive(pathname, href);
                        return (
                          <Link
                            key={href}
                            href={href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-[#f1e5dc] text-haus-terracotta' : 'text-black/75 hover:bg-black/5'}`}
                          >
                            <Icon className="size-4 shrink-0" />
                            {label}
                          </Link>
                        );
                      },
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/10 text-sm font-bold text-black/70 disabled:opacity-50"
                  >
                    {loggingOut ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <LogOut className="size-4" />
                    )}
                    Sair da conta
                  </button>
                </PopoverContent>
              </Popover>
            ) : (
              <Link
                href="/painel/configuracoes"
                aria-current={
                  isActive(pathname, '/painel/configuracoes')
                    ? 'page'
                    : undefined
                }
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[9px] font-bold transition active:scale-[0.97] min-[360px]:px-1 min-[360px]:text-[10px] ${isActive(pathname, '/painel/configuracoes') ? 'bg-[#f1e5dc] text-haus-terracotta' : 'text-black/60'}`}
              >
                <Settings className="size-5" />
                Conta
              </Link>
            )}
          </div>
        </nav>
      </main>
    </StaffSession.Provider>
  );
}
