const VERIFY_INTERVAL_MS = 24 * 60 * 60_000;
const RETRY_INTERVAL_MS = 15 * 60_000;

export function shouldRefreshStaffPush(
  now: number,
  lastVerified: number,
  lastAttempt: number,
  online: boolean,
) {
  if (!online) return false;
  const verifiedRecently =
    lastVerified > 0 &&
    lastVerified <= now &&
    now - lastVerified < VERIFY_INTERVAL_MS;
  const attemptedRecently =
    lastAttempt > 0 &&
    lastAttempt <= now &&
    now - lastAttempt < RETRY_INTERVAL_MS;
  return !verifiedRecently && !attemptedRecently;
}
