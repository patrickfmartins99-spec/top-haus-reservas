export type ServiceType = 'almoco' | 'rodizio';

export type ReservationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'presence_confirmed'
  | 'cancelled'
  | 'seated'
  | 'no_show'
  | 'completed';

export type SeatingPreference = 'sem_preferencia' | 'sofa' | 'parede_vidro' | 'parede_tomada';

export interface CreateReservationInput {
  service: ServiceType;
  serviceDate: string;
  arrivalTime: string;
  partySize: number;
  customerName: string;
  whatsapp: string;
  seatingPreference: SeatingPreference;
  notes?: string;
}

export const CAPACITY_PER_SERVICE = 70;
export const AUTO_APPROVAL_LIMIT = 20;
export const CANCELLATION_HOURS = 24;
export const LATE_TOLERANCE_MINUTES = 10;
export const MAX_BOOKING_MONTHS = 12;

export const ALLOWED_TIMES: Record<ServiceType, string[]> = {
  almoco: ['11:00', '11:15', '11:30'],
  rodizio: ['18:30', '18:45', '19:00'],
};

export function isReservationInput(value: unknown): value is CreateReservationInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  const service = input.service;
  return (
    (service === 'almoco' || service === 'rodizio') &&
    typeof input.serviceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate) &&
    typeof input.arrivalTime === 'string' &&
    ALLOWED_TIMES[service].includes(input.arrivalTime) &&
    Number.isInteger(input.partySize) &&
    Number(input.partySize) >= 1 &&
    typeof input.customerName === 'string' &&
    input.customerName.trim().length >= 2 &&
    typeof input.whatsapp === 'string' &&
    input.whatsapp.replace(/\D/g, '').length >= 10 &&
    ['sem_preferencia', 'sofa', 'parede_vidro', 'parede_tomada'].includes(String(input.seatingPreference)) &&
    (input.notes === undefined || typeof input.notes === 'string')
  );
}

export function reservationInstant(input: Pick<CreateReservationInput, 'serviceDate' | 'arrivalTime'>) {
  return new Date(`${input.serviceDate}T${input.arrivalTime}:00-03:00`);
}

export function isAtLeastTwentyFourHoursAhead(input: Pick<CreateReservationInput, 'serviceDate' | 'arrivalTime'>) {
  return reservationInstant(input).getTime() - Date.now() >= CANCELLATION_HOURS * 60 * 60 * 1000;
}

export function isWithinBookingWindow(input: Pick<CreateReservationInput, 'serviceDate' | 'arrivalTime'>) {
  const latest = new Date();
  latest.setMonth(latest.getMonth() + MAX_BOOKING_MONTHS);
  return reservationInstant(input).getTime() <= latest.getTime();
}

export function isMonday(serviceDate: string) {
  return new Date(`${serviceDate}T12:00:00-03:00`).getDay() === 1;
}
