import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';

function timestamp(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
    return value.toDate().toISOString();
  return new Date(0).toISOString();
}

export async function GET(request: Request) {
  const context = await requireStaff(request);
  if (!context)
    return NextResponse.json(
      { error: 'Acesso restrito à equipe.' },
      { status: 403 },
    );
  const database = getAdminDatabase();
  if (!database)
    return NextResponse.json(
      { error: 'Firebase não configurado.' },
      { status: 503 },
    );

  const [
    reservationSnapshot,
    waitlistSnapshot,
    messageSnapshot,
    eventSnapshot,
  ] = await Promise.all([
    database
      .collection('reservations')
      .orderBy('createdAt', 'desc')
      .limit(300)
      .get(),
    database
      .collection('waitlist')
      .orderBy('enteredAt', 'asc')
      .limit(100)
      .get(),
    database
      .collection('whatsappQueue')
      .where('status', '==', 'manual_pending')
      .limit(100)
      .get(),
    database
      .collection('staffNotifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get(),
  ]);
  const items = [
    ...eventSnapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: `event_${document.id}`,
        title: String(data.title ?? 'Atualização no atendimento'),
        description: String(
          data.description ?? 'Abra para conferir os detalhes.',
        ),
        href: String(data.href ?? '/painel'),
        createdAt: timestamp(data.createdAt),
        priority: 0,
      };
    }),
    ...(messageSnapshot.empty
      ? []
      : [
          {
            id: 'manual_messages',
            title: 'Mensagens aguardando envio manual',
            description: `${messageSnapshot.size} mensagens para conferir e enviar pelo WhatsApp.`,
            href: '/painel/mensagens',
            createdAt: new Date().toISOString(),
            priority: 3,
          },
        ]),
    ...reservationSnapshot.docs
      .filter((document) => document.data().status === 'pending_approval')
      .map((document) => {
        const data = document.data();
        return {
          id: `reservation_${document.id}`,
          title: 'Reserva aguardando aprovação',
          description: `${String(data.customerName ?? 'Cliente')} · ${Number(data.partySize ?? 0)} pessoas · ${String(data.serviceDate ?? '')}`,
          href: `/painel/reservas?busca=${document.id}`,
          createdAt: timestamp(data.createdAt),
          priority: 2,
        };
      }),
    ...waitlistSnapshot.docs
      .filter((document) =>
        ['waiting', 'called'].includes(String(document.data().status)),
      )
      .map((document) => {
        const data = document.data();
        return {
          id: `waitlist_${document.id}`,
          title:
            data.status === 'called'
              ? 'Cliente chamado na fila'
              : 'Cliente aguardando na fila',
          description: `${String(data.customerName ?? 'Cliente')} · ${Number(data.partySize ?? 0)} pessoas`,
          href: '/painel/fila',
          createdAt: timestamp(data.enteredAt),
          priority: data.status === 'called' ? 2 : 1,
        };
      }),
  ].sort(
    (a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt),
  );

  return NextResponse.json(
    { count: items.length, items: items.slice(0, 30) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
