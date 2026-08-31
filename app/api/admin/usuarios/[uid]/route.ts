import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin-request';
import { getAdminDatabase } from '@/lib/firebase/admin';

type ActionPayload =
  | { action: 'set_disabled'; disabled: boolean }
  | { action: 'reset_password'; password: string }
  | { action: 'set_role'; role: 'admin' | 'staff' };

export async function PATCH(
  request: Request,
  context: RouteContext<'/api/admin/usuarios/[uid]'>,
) {
  const adminContext = await requireAdmin(request);
  if (!adminContext) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });

  const { uid } = await context.params;
  const payload = await request.json().catch(() => null) as ActionPayload | null;
  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  if (!payload || !['set_disabled', 'reset_password', 'set_role'].includes(payload.action)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  if (payload.action === 'set_disabled') {
    if (uid === adminContext.decodedToken.uid && payload.disabled) {
      return NextResponse.json({ error: 'Você não pode bloquear o próprio acesso.' }, { status: 400 });
    }
    await adminContext.authentication.updateUser(uid, { disabled: Boolean(payload.disabled) });
    await database.collection('staff').doc(uid).set({
      active: !payload.disabled,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (payload.action === 'reset_password') {
    if (typeof payload.password !== 'string' || payload.password.length < 8) {
      return NextResponse.json({ error: 'A nova senha precisa ter ao menos 8 caracteres.' }, { status: 400 });
    }
    await adminContext.authentication.updateUser(uid, { password: payload.password });
  }

  if (payload.action === 'set_role') {
    if (payload.role !== 'admin' && payload.role !== 'staff') {
      return NextResponse.json({ error: 'Permissão inválida.' }, { status: 400 });
    }
    if (uid === adminContext.decodedToken.uid && payload.role !== 'admin') {
      return NextResponse.json({ error: 'Você não pode remover a própria permissão administrativa.' }, { status: 400 });
    }
    const user = await adminContext.authentication.getUser(uid);
    await adminContext.authentication.setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      staff: true,
      admin: payload.role === 'admin',
    });
    await database.collection('staff').doc(uid).set({
      role: payload.role,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await database.collection('auditLogs').add({
    actorType: 'staff',
    actorId: adminContext.decodedToken.uid,
    action: `staff_${payload.action}`,
    targetId: uid,
    changes: payload,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
