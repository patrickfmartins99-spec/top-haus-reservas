import 'server-only';

import { getAdminAuthentication } from '@/lib/firebase/admin';

export async function requireStaff(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  const authentication = getAdminAuthentication();

  if (!token || !authentication) return null;

  try {
    const decodedToken = await authentication.verifyIdToken(token, true);
    const user = await authentication.getUser(decodedToken.uid);
    if (
      decodedToken.staff !== true ||
      user.disabled ||
      user.customClaims?.staff !== true
    )
      return null;
    decodedToken.admin = user.customClaims?.admin === true;
    return { authentication, decodedToken, user };
  } catch {
    return null;
  }
}
