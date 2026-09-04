'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  BarChart3,
  CalendarDays,
  CalendarX2,
  Clock3,
  LoaderCircle,
  TrendingUp,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getFirebaseClient } from '@/lib/firebase/client';

type Report = {
  period: { days: number; startDate: string; endDate: string };
  summary: {
    reservations: number;
    people: number;
    averageReservationsPerDay: number;
    cancellations: number;
    noShowRate: number;
    averageWaitMinutes: number;
  };
  daily: Array<{
    date: string;
    label: string;
    reservations: number;
    people: number;
  }>;
  busiestDays: Array<{
    date: string;
    label: string;
    reservations: number;
    people: number;
  }>;
  cancellations: Array<{
    id: string;
    customerName: string;
    serviceDate: string;
    occurredAt: string | null;
    type: string;
    actor: string;
    reason: string;
    note: string;
  }>;
  frequentCustomers: Array<{
    customerName: string;
    visits: number;
    people: number;
    lastVisit: string;
  }>;
  waitlistOutcomes: Array<{ label: string; value: number }>;
};

function formatDate(value: string) {
  return value.split('-').reverse().join('/');
}

function formatDateTime(value: string | null) {
  if (!value) return 'Horário não registrado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export default function ReportsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const firebase = getFirebaseClient();
    if (!firebase) {
      const timeout = window.setTimeout(() => {
        setError('Firebase não configurado.');
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return onAuthStateChanged(firebase.auth, (user) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    async function loadReport() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/relatorios?dias=${days}`, {
          headers: {
            Authorization: `Bearer ${await currentUser!.getIdToken()}`,
          },
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ?? 'Não foi possível carregar os relatórios.',
          );
        if (active) setReport(data.report);
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Não foi possível carregar os relatórios.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReport();
    return () => {
      active = false;
    };
  }, [currentUser, days]);

  const maximumWaitlistOutcome = Math.max(
    1,
    ...(report?.waitlistOutcomes.map((item) => item.value) ?? []),
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-haus-terracotta">
            Gestão
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-black/65">
            Reservas, comparecimentos, cancelamentos e desempenho da fila.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Período do relatório">
          {[30, 90, 365].map((period) => (
            <Button
              key={period}
              variant={days === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(period)}
            >
              {period === 365 ? '12 meses' : `${period} dias`}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <p
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <p className="flex items-center gap-2 text-sm text-black/65">
            <LoaderCircle className="size-4 animate-spin" /> Calculando
            relatórios...
          </p>
        </div>
      ) : null}

      {!loading && report ? (
        <>
          <p className="text-xs font-semibold text-black/55">
            Período de {formatDate(report.period.startDate)} a{' '}
            {formatDate(report.period.endDate)}.
          </p>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            {[
              {
                label: 'Reservas válidas',
                value: report.summary.reservations,
                detail: `${report.summary.people} pessoas`,
                icon: CalendarDays,
              },
              {
                label: 'Média diária',
                value: report.summary.averageReservationsPerDay,
                detail: 'por dia de funcionamento',
                icon: TrendingUp,
              },
              {
                label: 'Cancelamentos',
                value: report.summary.cancellations,
                detail: 'inclui no show',
                icon: CalendarX2,
              },
              {
                label: 'Taxa de no show',
                value: `${report.summary.noShowRate}%`,
                detail: 'entre chegadas registradas',
                icon: UserRoundCheck,
              },
              {
                label: 'Espera média',
                value: `${report.summary.averageWaitMinutes} min`,
                detail: 'clientes atendidos da fila',
                icon: Clock3,
              },
              {
                label: 'Pessoas reservadas',
                value: report.summary.people,
                detail: 'reservas válidas',
                icon: Users,
              },
            ].map(({ label, value, detail, icon: Icon }) => (
              <Card
                key={label}
                className="bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] ring-black/7"
              >
                <CardContent>
                  <span className="mb-4 grid size-9 place-items-center rounded-xl bg-[#eadcd2] text-haus-terracotta">
                    <Icon className="size-4" />
                  </span>
                  <p className="text-xs font-semibold text-black/60">{label}</p>
                  <p className="mt-1 text-2xl font-extrabold">{value}</p>
                  <p className="mt-1 text-[11px] font-medium text-black/50">
                    {detail}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
            <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
              <CardHeader className="border-b border-black/7">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-5 text-haus-terracotta" />{' '}
                  Movimento diário
                </CardTitle>
                <p className="text-sm text-black/60">
                  Reservas e pessoas nos últimos {report.daily.length} dias do
                  período.
                </p>
              </CardHeader>
              <CardContent className="h-80 min-w-0 pt-5">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={report.daily}
                    margin={{ left: -18, right: 4, top: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e7e1db"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#f4e7d7' }} />
                    <Bar
                      name="Reservas"
                      dataKey="reservations"
                      fill="#8c4b28"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      name="Pessoas"
                      dataKey="people"
                      fill="#000000"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
              <CardHeader className="border-b border-black/7">
                <CardTitle>Maiores dias</CardTitle>
                <p className="text-sm text-black/60">
                  Ordenados pelo número de pessoas.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!report.busiestDays.length ? (
                  <p className="py-8 text-center text-sm text-black/60">
                    Ainda não há movimento registrado.
                  </p>
                ) : null}
                {report.busiestDays.map((day, index) => (
                  <div
                    key={day.date}
                    className="flex items-center gap-3 rounded-xl border border-black/8 bg-stone-50 p-3"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{day.label}</p>
                      <p className="text-xs text-black/60">
                        {day.reservations} reservas
                      </p>
                    </div>
                    <strong>{day.people} pessoas</strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
              <CardHeader className="border-b border-black/7">
                <CardTitle>Clientes frequentes</CardTitle>
                <p className="text-sm text-black/60">
                  Baseado nas chegadas confirmadas pela equipe.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!report.frequentCustomers.length ? (
                  <p className="py-8 text-center text-sm text-black/60">
                    Confirme as chegadas para formar este ranking.
                  </p>
                ) : null}
                {report.frequentCustomers.map((customer, index) => (
                  <div
                    key={`${customer.customerName}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/8 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {customer.customerName}
                      </p>
                      <p className="text-xs text-black/60">
                        Última visita: {formatDate(customer.lastVisit)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold">
                        {customer.visits}{' '}
                        {customer.visits === 1 ? 'visita' : 'visitas'}
                      </p>
                      <p className="text-xs text-black/60">
                        {customer.people} pessoas
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
              <CardHeader className="border-b border-black/7">
                <CardTitle>Resultados da fila</CardTitle>
                <p className="text-sm text-black/60">
                  Motivos de encerramento dos atendimentos.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {report.waitlistOutcomes.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-haus-terracotta"
                        style={{
                          width: `${Math.max(item.value ? 8 : 0, (item.value / maximumWaitlistOutcome) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white shadow-[0_12px_36px_rgba(0,0,0,0.08)] ring-black/7">
            <CardHeader className="border-b border-black/7">
              <CardTitle>Cancelamentos e no show</CardTitle>
              <p className="text-sm text-black/60">
                Cliente, momento, origem e motivo registrado.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {!report.cancellations.length ? (
                <p className="py-10 text-center text-sm text-black/60 lg:col-span-2">
                  Nenhum cancelamento ou no show no período.
                </p>
              ) : null}
              {report.cancellations.slice(0, 50).map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-black/10 bg-stone-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold">{item.customerName}</p>
                      <p className="mt-1 text-xs font-medium text-black/60">
                        Reserva para {formatDate(item.serviceDate)}
                      </p>
                    </div>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                      {item.type}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div>
                      <dt className="inline font-semibold">Quando: </dt>
                      <dd className="inline text-black/70">
                        {formatDateTime(item.occurredAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">Registrado por: </dt>
                      <dd className="inline text-black/70">{item.actor}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold">Motivo: </dt>
                      <dd className="inline text-black/70">{item.reason}</dd>
                    </div>
                    {item.note ? (
                      <div>
                        <dt className="inline font-semibold">Detalhes: </dt>
                        <dd className="inline text-black/70">{item.note}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
