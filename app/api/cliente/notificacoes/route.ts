import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { verifiedAccess } from '@/lib/firebase/reservation-notifications';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ error: 'Notificações temporariamente indisponíveis.' }, { status: 503 });
  const ids = await verifiedAccess(db, payload?.accesses);
  if (!ids.length) return NextResponse.json({ error: 'Faça ou consulte sua reserva para acompanhar as notificações.' }, { status: 403 });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (payload.action !== 'list') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const lists = await Promise.all(ids.map(async (id) => {
    const events = await db.collection('reservations').doc(id).collection('notifications').orderBy('createdAt', 'desc').limit(30).get();
    return events.docs.map((doc) => ({ id: doc.id, reservationId: id, title: doc.data().title, body: doc.data().body, createdAt: doc.data().createdAt?.toDate().toISOString() ?? '' }));
  }));
  return NextResponse.json({ items: lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) }, { headers });
}
