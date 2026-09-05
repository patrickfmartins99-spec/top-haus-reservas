import type { ServiceType } from '@/lib/domain/reservations';

export type SpecialDateMode = 'open' | 'closed';

export type SpecialDateException = {
  id: string;
  serviceDate: string;
  service: ServiceType;
  mode: SpecialDateMode;
  isOpen: boolean;
  bookingPaused: boolean;
  capacityLimit: number | null;
  arrivalTimes: string[];
  customerNotice: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function specialDateId(serviceDate: string, service: ServiceType) {
  return `${serviceDate}_${service}`;
}

export function validServiceDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function normalizeSpecialDate(
  value: Record<string, unknown>,
  id = '',
): SpecialDateException | null {
  const serviceDate = value.serviceDate;
  const service = value.service;
  const mode =
    value.mode === 'closed' || value.isOpen === false ? 'closed' : 'open';
  if (
    !validServiceDate(serviceDate) ||
    (service !== 'almoco' && service !== 'rodizio')
  )
    return null;

  const capacity = Number(value.capacityLimit);
  const capacityLimit =
    value.capacityLimit === null ||
    value.capacityLimit === '' ||
    value.capacityLimit === undefined
      ? null
      : Number.isInteger(capacity) && capacity >= 1 && capacity <= 500
        ? capacity
        : Number.NaN;
  if (Number.isNaN(capacityLimit)) return null;

  const arrivalTimes = Array.isArray(value.arrivalTimes)
    ? [
        ...new Set(
          value.arrivalTimes.filter(
            (time): time is string =>
              typeof time === 'string' && timePattern.test(time),
          ),
        ),
      ].sort()
    : [];
  if (
    Array.isArray(value.arrivalTimes) &&
    arrivalTimes.length !== value.arrivalTimes.length
  )
    return null;

  return {
    id: id || specialDateId(serviceDate, service),
    serviceDate,
    service,
    mode,
    isOpen: mode === 'open',
    bookingPaused: value.bookingPaused === true,
    capacityLimit,
    arrivalTimes: arrivalTimes.slice(0, 12),
    customerNotice:
      typeof value.customerNotice === 'string'
        ? value.customerNotice.trim().slice(0, 240)
        : '',
  };
}

export function exceptionFromSnapshot(
  id: string,
  value: Record<string, unknown>,
) {
  const [dateFromId, serviceFromId] = id.split(/_(?=almoco$|rodizio$)/);
  return normalizeSpecialDate(
    {
      ...value,
      serviceDate: value.serviceDate ?? dateFromId,
      service: value.service ?? serviceFromId,
    },
    id,
  );
}
