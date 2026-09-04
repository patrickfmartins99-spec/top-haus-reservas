import 'server-only';

import { getAdminAuthentication } from '@/lib/firebase/admin';

export async function requireStaff(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const authentication = getAdminAuthentication();

  if (!token || !authentication) return null;

  try {
    const decodedToken = await authentication.verifyIdToken(token, true);
    if (decodedToken.staff !== true) return null;
    return { authentication, decodedToken };
  } catch {
    return null;
  }
}
