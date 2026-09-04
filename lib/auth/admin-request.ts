import 'server-only';
import { requireStaff } from './staff-request';
export async function requireAdmin(request: Request) {
  const context = await requireStaff(request);
  return context?.decodedToken.admin === true ? context : null;
}
