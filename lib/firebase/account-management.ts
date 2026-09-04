import 'server-only';
import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import sharp from 'sharp';
import { AccountError, accountFields } from '@/lib/auth/account-validation';
import {
  staffEmailFromUsername,
  usernameFromStaffEmail,
} from '@/lib/auth/staff-identity';
export async function accountProfile(auth: Auth, db: Firestore, uid: string) {
  const [u, p] = await Promise.all([
    auth.getUser(uid),
    db.collection('staffProfilePhotos').doc(uid).get(),
  ]);
  if (u.disabled || u.customClaims?.staff !== true)
    throw new AccountError('Acesso indisponível.', 403);
  return {
    uid,
    displayName: u.displayName ?? '',
    username: usernameFromStaffEmail(u.email),
    role: u.customClaims?.admin === true ? 'admin' : 'staff',
    photo: p.data()?.data ?? '',
  };
}
export async function normalizePhoto(value: unknown) {
  if (value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > 400000 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
  )
    throw new AccountError('Escolha uma foto JPG, PNG ou WebP válida.');
  try {
    const image = sharp(Buffer.from(value.split(',')[1], 'base64'), {
      limitInputPixels: 16000000,
    });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) > 1
    )
      throw new Error('FORMAT');
    const bytes = await image
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return 'data:image/jpeg;base64,' + bytes.toString('base64');
  } catch {
    throw new AccountError(
      'Não foi possível ler a foto. Escolha outra imagem.',
    );
  }
}
// Serialize role/deletion operations and recheck the actor after acquiring the lock.
export async function withAccountLock<T>(
  db: Firestore,
  auth: Auth,
  actor: DecodedIdToken,
  admin: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  const ref = db.collection('mutationLocks').doc('staff-accounts'),
    owner = randomUUID();
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.data()?.until > Date.now())
      throw new AccountError(
        'Outro acesso está sendo atualizado. Tente novamente em instantes.',
        409,
      );
    tx.set(ref, { owner, until: Date.now() + 120000 });
  });
  try {
    const u = await auth.getUser(actor.uid);
    if (
      u.disabled ||
      u.customClaims?.staff !== true ||
      (admin && u.customClaims?.admin !== true)
    )
      throw new AccountError('Sem permissão para esta ação.', 403);
    return await operation();
  } finally {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.data()?.owner === owner) tx.delete(ref);
    });
  }
}
export async function editAccount(
  db: Firestore,
  auth: Auth,
  actor: DecodedIdToken,
  uid: string,
  p: Record<string, unknown>,
  self: boolean,
) {
  const fields = accountFields(p, self);
  if (self && uid !== actor.uid)
    throw new AccountError('Edite somente sua conta.', 403);
  const photo =
    p.photo === undefined ? undefined : await normalizePhoto(p.photo);
  return withAccountLock(db, auth, actor, !self, async () => {
    const prev = await auth.getUser(uid);
    if (prev.customClaims?.staff !== true)
      throw new AccountError('Usuário da equipe não encontrado.', 404);
    const changed =
      staffEmailFromUsername(fields.username) !== prev.email ||
      Boolean(fields.password);
    if (
      uid === actor.uid &&
      changed &&
      (!Number.isFinite(actor.auth_time) ||
        Date.now() / 1000 - actor.auth_time > 300)
    )
      throw new AccountError(
        'Confirme sua senha atual para alterar o acesso.',
        401,
      );
    const role = self
        ? prev.customClaims?.admin === true
          ? 'admin'
          : 'staff'
        : p.role,
      disabled = self ? prev.disabled : Boolean(p.disabled);
    if (
      uid === actor.uid &&
      (disabled || (prev.customClaims?.admin === true && role !== 'admin'))
    )
      throw new AccountError(
        'Você não pode bloquear nem remover a própria permissão administrativa.',
      );
    await auth.updateUser(uid, {
      displayName: fields.displayName,
      email: staffEmailFromUsername(fields.username),
      ...(fields.password ? { password: fields.password } : {}),
      disabled,
    });
    if (!self)
      await auth.setCustomUserClaims(uid, {
        ...prev.customClaims,
        staff: true,
        admin: role === 'admin',
      });
    if (
      changed ||
      disabled ||
      (!self && prev.customClaims?.admin !== (role === 'admin'))
    )
      await auth.revokeRefreshTokens(uid);
    const batch = db.batch();
    batch.set(
      db.collection('staff').doc(uid),
      {
        displayName: fields.displayName,
        username: fields.username,
        role,
        active: !disabled,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (photo !== undefined)
      batch.set(db.collection('staffProfilePhotos').doc(uid), {
        data: photo,
        updatedAt: FieldValue.serverTimestamp(),
      });
    batch.set(db.collection('auditLogs').doc(), {
      actorType: 'staff',
      actorId: actor.uid,
      targetId: uid,
      action: self ? 'staff_profile_updated' : 'staff_updated',
      changes: {
        before: {
          displayName: prev.displayName ?? '',
          username: usernameFromStaffEmail(prev.email),
          role: prev.customClaims?.admin === true ? 'admin' : 'staff',
          active: !prev.disabled,
        },
        after: {
          displayName: fields.displayName,
          username: fields.username,
          role,
          active: !disabled,
        },
        passwordChanged: Boolean(fields.password),
        photoChanged: photo !== undefined,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true, signInAgain: uid === actor.uid && changed };
  });
}
export async function removeAccount(
  db: Firestore,
  auth: Auth,
  actor: DecodedIdToken,
  uid: string,
  confirmation: unknown,
) {
  if (uid === actor.uid)
    throw new AccountError(
      'Você não pode excluir o próprio acesso. Peça a outro administrador.',
    );
  return withAccountLock(db, auth, actor, true, async () => {
    const u = await auth.getUser(uid);
    if (u.customClaims?.staff !== true)
      throw new AccountError('Usuário da equipe não encontrado.', 404);
    if (confirmation !== usernameFromStaffEmail(u.email))
      throw new AccountError('Digite o nome de usuário para confirmar.');
    const audit = db.collection('auditLogs').doc();
    await audit.set({
      actorType: 'staff',
      actorId: actor.uid,
      targetId: uid,
      action: 'staff_deletion_requested',
      createdAt: FieldValue.serverTimestamp(),
    });
    await auth.deleteUser(uid);
    const devices = await db
      .collection('staffPushSubscriptions')
      .where('uid', '==', uid)
      .get();
    const batch = db.batch();
    batch.set(
      db.collection('staff').doc(uid),
      {
        active: false,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: actor.uid,
      },
      { merge: true },
    );
    batch.delete(db.collection('staffProfilePhotos').doc(uid));
    devices.docs.forEach((doc) => batch.delete(doc.ref));
    batch.update(audit, {
      action: 'staff_deleted',
      completedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { ok: true };
  });
}
export function accountFailure(error: unknown) {
  if (error instanceof AccountError)
    return Response.json({ error: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === 'auth/email-already-exists')
    return Response.json(
      { error: 'Este nome de usuário já está em uso.' },
      { status: 409 },
    );
  if (code === 'auth/user-not-found')
    return Response.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  console.error('Falha na operação de conta:', code ?? 'internal');
  return Response.json(
    {
      error:
        'Não foi possível concluir. Atualize a lista antes de tentar novamente.',
    },
    { status: 500 },
  );
}
