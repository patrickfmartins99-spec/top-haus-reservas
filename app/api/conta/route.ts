import { requireStaff } from '@/lib/auth/staff-request';
import { getAdminDatabase } from '@/lib/firebase/admin';
import {
  accountFailure,
  accountProfile,
  editAccount,
} from '@/lib/firebase/account-management';
export async function GET(request: Request) {
  const c = await requireStaff(request),
    db = getAdminDatabase();
  if (!c)
    return Response.json(
      { error: 'Entre com seu acesso da equipe.' },
      { status: 403 },
    );
  if (!db)
    return Response.json({ error: 'Sistema indisponível.' }, { status: 503 });
  try {
    return Response.json(
      {
        profile: await accountProfile(c.authentication, db, c.decodedToken.uid),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return accountFailure(e);
  }
}
export async function PATCH(request: Request) {
  const c = await requireStaff(request),
    db = getAdminDatabase();
  if (!c)
    return Response.json(
      { error: 'Entre com seu acesso da equipe.' },
      { status: 403 },
    );
  if (!db)
    return Response.json({ error: 'Sistema indisponível.' }, { status: 503 });
  const body = await request.text();
  if (body.length > 420000)
    return Response.json({ error: 'Foto muito grande.' }, { status: 413 });
  try {
    const p = JSON.parse(body);
    if (!p || typeof p !== 'object' || Array.isArray(p))
      return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    return Response.json(
      await editAccount(
        db,
        c.authentication,
        c.decodedToken,
        c.decodedToken.uid,
        p,
        true,
      ),
    );
  } catch (e) {
    return accountFailure(e);
  }
}
