import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin-request';
import {
  isValidUsername,
  staffEmailFromUsername,
  usernameFromStaffEmail,
} from '@/lib/auth/staff-identity';
import { getAdminDatabase } from '@/lib/firebase/admin';

type Role = 'admin' | 'staff';

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'staff';
}

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });

  const result = await context.authentication.listUsers(1000);
  const users = result.users
    .filter((user) => user.customClaims?.staff === true)
    .map((user) => ({
      uid: user.uid,
      username: usernameFromStaffEmail(user.email),
      displayName: user.displayName ?? '',
      role: user.customClaims?.admin === true ? 'admin' : 'staff',
      disabled: user.disabled,
      createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime ?? null,
    }));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const context = await requireAdmin(request);
  if (!context) return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
  const username = typeof payload?.username === 'string' ? payload.username : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';
  const role = payload?.role;

  if (displayName.length < 2 || !isValidUsername(username) || password.length < 8 || !isRole(role)) {
    return NextResponse.json({ error: 'Preencha nome, usuário, senha de ao menos 8 caracteres e permissão.' }, { status: 400 });
  }

  const database = getAdminDatabase();
  if (!database) return NextResponse.json({ error: 'Firebase não configurado.' }, { status: 503 });

  let createdUid = '';
  try {
    const user = await context.authentication.createUser({
      email: staffEmailFromUsername(username),
      emailVerified: true,
      password,
      displayName,
      disabled: false,
    });
    createdUid = user.uid;

    await context.authentication.setCustomUserClaims(user.uid, {
      staff: true,
      admin: role === 'admin',
    });

    const batch = database.batch();
    batch.set(database.collection('staff').doc(user.uid), {
      username: username.toLowerCase(),
      displayName,
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: context.decodedToken.uid,
    });
    batch.set(database.collection('auditLogs').doc(), {
      actorType: 'staff',
      actorId: context.decodedToken.uid,
      action: 'staff_created',
      targetId: user.uid,
      changes: { username: username.toLowerCase(), displayName, role },
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ uid: user.uid }, { status: 201 });
  } catch (error) {
    if (createdUid) await context.authentication.deleteUser(createdUid).catch(() => undefined);
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    }
    throw error;
  }
}
