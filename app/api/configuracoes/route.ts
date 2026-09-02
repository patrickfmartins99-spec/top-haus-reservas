import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/staff-request';
import { getOperationalSettings, normalizeOperationalSettings } from '@/lib/domain/operational-settings';
import { getAdminDatabase } from '@/lib/firebase/admin';

export async function GET(request: Request) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });
  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });
  return NextResponse.json({ settings: await getOperationalSettings(database) });
}

export async function PATCH(request: Request) {
  const context = await requireStaff(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito à equipe.' }, { status: 403 });
  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return NextResponse.json({ error: 'Configurações inválidas.' }, { status: 400 });
  const settings = normalizeOperationalSettings(payload);
  if (settings.autoApprovalLimit > settings.capacityPerService) {
    return NextResponse.json({ error: 'A aprovação automática não pode ultrapassar a capacidade do serviço.' }, { status: 400 });
  }

  const batch = database.batch();
  batch.set(database.collection('systemSettings').doc('operational'), {
    ...settings,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.decodedToken.uid,
  }, { merge: true });
  batch.set(database.collection('auditLogs').doc(), {
    actorType: 'staff',
    actorId: context.decodedToken.uid,
    action: 'settings_updated',
    changes: settings,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({ settings });
}
