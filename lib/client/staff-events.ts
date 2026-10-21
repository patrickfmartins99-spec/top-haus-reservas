export type StaffEntityEvent = {
  id: string;
  entityId: string;
  entityType: 'reservation' | 'waitlist';
  serviceDate?: string;
};

const listeners = new Set<(event: StaffEntityEvent) => void>();

// Local fan-out of the EXISTING bell listener. No Firebase listener or timer here.
export function publishStaffEvent(event: StaffEntityEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribeStaffEvents(
  listener: (event: StaffEntityEvent) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isStaffEntityEvent(value: unknown): value is StaffEntityEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as StaffEntityEvent;
  return (
    typeof event.id === 'string' &&
    typeof event.entityId === 'string' &&
    /^[A-Za-z0-9_-]{1,160}$/.test(event.entityId) &&
    (event.entityType === 'reservation' || event.entityType === 'waitlist')
  );
}

// A processing/sent update on the same notification must not reload a reservation.
export function newStaffEvents(events: StaffEntityEvent[], seen: Set<string>) {
  const fresh = events.filter((event) => !seen.has(event.id));
  for (const event of events) seen.add(event.id);
  while (seen.size > 300) seen.delete(seen.values().next().value!);
  return fresh;
}

export function mergeStaffEntity<T extends { id: string }>(
  current: T[],
  id: string,
  fresh: T | undefined,
  belongs: (item: T) => boolean = () => true,
) {
  const index = current.findIndex((item) => item.id === id);
  if (!fresh || !belongs(fresh))
    return current.filter((item) => item.id !== id);
  if (index < 0) return [...current, fresh];
  return current.map((item) => (item.id === id ? fresh : item));
}
