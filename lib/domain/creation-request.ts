import { createHash } from 'node:crypto';

export function validCreationRequestKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function creationDocumentId(
  kind: 'reservation' | 'waitlist',
  requestKey: string,
  actor: string,
) {
  const digest = createHash('sha256')
    .update(`${kind}|${actor}|${requestKey.toLowerCase()}`)
    .digest('hex');
  return `req_${digest}`;
}

export function creationPayloadHash(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
