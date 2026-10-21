const CACHE_PREFIX = 'tophaus.staff.cache.v1';
const OPERATIONAL_CACHE_MAX_AGE_MS = 18 * 60 * 60_000;
const PROFILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

type CacheEnvelope<T> = {
  savedAt: string;
  value: T;
};

export type StaffCacheArea = 'profile' | 'reservations' | 'waitlist';

function cacheKey(area: StaffCacheArea) {
  return `${CACHE_PREFIX}.${area}`;
}

function maxAge(area: StaffCacheArea) {
  return area === 'profile'
    ? PROFILE_CACHE_MAX_AGE_MS
    : OPERATIONAL_CACHE_MAX_AGE_MS;
}

export function writeStaffCache<T>(area: StaffCacheArea, value: T) {
  try {
    if (area === 'profile') {
      const previous = readStaffCache<{ uid: string }>('profile');
      const nextUid = (value as { uid?: string })?.uid;
      if (!previous || previous.value.uid !== nextUid) {
        clearStaffCache('reservations');
        clearStaffCache('waitlist');
      }
    }
    const envelope: CacheEnvelope<T> = {
      savedAt: new Date().toISOString(),
      value,
    };
    window.localStorage.setItem(cacheKey(area), JSON.stringify(envelope));
  } catch {
    // O modo privado ou o limite do aparelho não pode interromper a operação online.
  }
}

export function readStaffCache<T>(area: StaffCacheArea) {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(cacheKey(area)) ?? 'null',
    ) as CacheEnvelope<T> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.savedAt ||
      !('value' in parsed)
    )
      return null;
    const savedAt = new Date(parsed.savedAt).getTime();
    if (
      !Number.isFinite(savedAt) ||
      savedAt > Date.now() + 60_000 ||
      Date.now() - savedAt > maxAge(area)
    ) {
      window.localStorage.removeItem(cacheKey(area));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAllStaffCache() {
  clearStaffCache('profile');
  clearStaffCache('reservations');
  clearStaffCache('waitlist');
}

export function isAccessDenied(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: number; code?: string };
  return (
    value.status === 401 ||
    value.status === 403 ||
    [
      'auth/user-disabled',
      'auth/user-token-expired',
      'auth/id-token-revoked',
    ].includes(value.code ?? '')
  );
}

export function clearStaffCache(area: StaffCacheArea) {
  try {
    window.localStorage.removeItem(cacheKey(area));
  } catch {
    // Sem ação: o encerramento da sessão deve continuar disponível.
  }
}

export function brazilDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(value);
}

export function cacheBelongsToToday(savedAt: string) {
  return brazilDate(new Date(savedAt)) === brazilDate();
}
