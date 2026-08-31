export const STAFF_AUTH_DOMAIN = 'staff.reservastophausnavega.firebaseapp.com';

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(value));
}

export function staffEmailFromUsername(value: string) {
  return `${normalizeUsername(value)}@${STAFF_AUTH_DOMAIN}`;
}

export function usernameFromStaffEmail(value?: string) {
  if (!value) return '';
  const suffix = `@${STAFF_AUTH_DOMAIN}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
