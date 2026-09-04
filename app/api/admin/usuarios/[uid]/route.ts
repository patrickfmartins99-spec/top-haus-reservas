import { requireAdmin } from '@/lib/auth/admin-request';
import { getAdminDatabase } from '@/lib/firebase/admin';
import {
  accountFailure,
  editAccount,
  removeAccount,
} from '@/lib/firebase/account-management';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const c = await requireAdmin(request),
    db = getAdminDatabase();
  if (!c)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  if (!db)
    return Response.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const { uid } = await params;
  try {
    const u = await c.authentication.getUser(uid);
    if (u.customClaims?.staff !== true)
      return Response.json(
        { error: 'Usuário não encontrado.' },
        { status: 404 },
      );
    const photo = await db.collection('staffProfilePhotos').doc(uid).get();
    return Response.json(
      { photo: photo.data()?.data ?? '' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return accountFailure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const c = await requireAdmin(request),
    db = getAdminDatabase();
  if (!c)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  if (!db)
    return Response.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const { uid } = await params,
    body = await request.text();
  if (body.length > 420000)
    return Response.json({ error: 'Foto muito grande.' }, { status: 413 });
  try {
    const p = JSON.parse(body);
    if (!p || typeof p !== 'object' || Array.isArray(p))
      return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    return Response.json(
      await editAccount(db, c.authentication, c.decodedToken, uid, p, false),
    );
  } catch (e) {
    return accountFailure(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const c = await requireAdmin(request),
    db = getAdminDatabase();
  if (!c)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403 },
    );
  if (!db)
    return Response.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const { uid } = await params,
    p = await request.json().catch(() => null);
  try {
    return Response.json(
      await removeAccount(
        db,
        c.authentication,
        c.decodedToken,
        uid,
        p?.confirmUsername,
      ),
    );
  } catch (e) {
    return accountFailure(e);
  }
}
