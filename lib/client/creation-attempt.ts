const PREFIX = 'tophaus.creation-attempt.v1.';
const memoryAttempts = new Map<
  string,
  { fingerprint: string; requestKey: string }
>();

async function payloadFingerprint(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function pendingCreationRequestKey(
  scope: string,
  payload: unknown,
) {
  const fingerprint = await payloadFingerprint(payload);
  const storageKey = `${PREFIX}${scope}`;

  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(storageKey) ?? 'null',
    ) as { fingerprint?: string; requestKey?: string } | null;
    if (saved?.fingerprint === fingerprint && saved.requestKey)
      return saved.requestKey;
  } catch {
    // A tentativa em memória continua disponível nesta página.
  }
  const saved = memoryAttempts.get(scope);
  return saved?.fingerprint === fingerprint ? saved.requestKey : null;
}

export async function creationRequestKey(scope: string, payload: unknown) {
  const pending = await pendingCreationRequestKey(scope, payload);
  if (pending) return pending;
  const fingerprint = await payloadFingerprint(payload);
  const storageKey = `${PREFIX}${scope}`;

  const requestKey = crypto.randomUUID();
  const attempt = { fingerprint, requestKey };
  memoryAttempts.set(scope, attempt);
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // A tentativa continua estável nesta página quando o armazenamento é negado.
  }
  return requestKey;
}

export function clearCreationRequestKey(scope: string) {
  memoryAttempts.delete(scope);
  try {
    window.sessionStorage.removeItem(`${PREFIX}${scope}`);
  } catch {
    // A limpeza em memória já permite uma nova inclusão deliberada.
  }
}
