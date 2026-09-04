import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin-request';
import { getAdminDatabase } from '@/lib/firebase/admin';

function serializeTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const snapshot = await database.collection('auditLogs').orderBy('createdAt', 'desc').limit(100).get();
  const actorIds = [...new Set(snapshot.docs
    .map((document) => document.data().actorId)
    .filter((actorId): actorId is string => typeof actorId === 'string' && actorId.length > 0))];
  const actorNames = new Map<string, string>();

  if (actorIds.length) {
    const users = await context.authentication.getUsers(actorIds.map((uid) => ({ uid })));
    for (const user of users.users) {
      actorNames.set(user.uid, user.displayName || user.email?.split('@')[0] || 'Colaborador');
    }
  }

  const events = snapshot.docs.map((document) => {
    const data = document.data();
    const actorType = String(data.actorType ?? 'system');
    const actorId = typeof data.actorId === 'string' ? data.actorId : null;
    return {
      id: document.id,
      action: String(data.action ?? 'activity'),
      actorType,
      actorName: actorType === 'staff' && actorId
        ? actorNames.get(actorId) ?? 'Colaborador'
        : actorType === 'customer' ? 'Cliente' : 'Sistema',
      reservationId: typeof data.reservationId === 'string' ? data.reservationId : null,
      waitlistId: typeof data.waitlistId === 'string' ? data.waitlistId : null,
      fromStatus: typeof data.fromStatus === 'string' ? data.fromStatus : null,
      toStatus: typeof data.toStatus === 'string' ? data.toStatus : null,
      tableChange: data.action === 'reservation_table_assigned' ? `${String(data.changes?.before?.tableLabel || 'não definida')} → ${String(data.changes?.after?.tableLabel || 'não definida')}` : null,
      createdAt: serializeTimestamp(data.createdAt),
    };
  });

  return NextResponse.json({ events });
}
