export type WaitlistTiming = {
  status: string;
  enteredAt: string | null;
  calledAt?: string | null;
};

export const WAITLIST_CALL_HOLD_MINUTES = 3;

function timeValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function waitDurationMilliseconds(entry: WaitlistTiming, now: number) {
  const enteredAt = timeValue(entry.enteredAt);
  if (enteredAt === null) return null;
  const calledAt = timeValue(entry.calledAt);
  const end = entry.status === 'called' && calledAt !== null ? calledAt : now;
  return Math.max(0, end - enteredAt);
}

export function calledDurationMilliseconds(entry: WaitlistTiming, now: number) {
  const calledAt = timeValue(entry.calledAt);
  if (entry.status !== 'called' || calledAt === null) return null;
  return Math.max(0, now - calledAt);
}

export function formatDurationClock(milliseconds: number | null) {
  if (milliseconds === null) return '00:00:00';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
