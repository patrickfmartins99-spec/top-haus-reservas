import type { Firestore } from 'firebase-admin/firestore';

export type OperationalSettings = {
  lunchArrivalLimit: string;
  dinnerArrivalLimit: string;
  minAdvanceHours: number;
  maxBookingMonths: number;
  capacityPerService: number;
  autoApprovalLimit: number;
  lateToleranceMinutes: number;
  restaurantWhatsapp: string;
  whatsappMode: 'assisted';
};

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  lunchArrivalLimit: '11:30',
  dinnerArrivalLimit: '19:00',
  minAdvanceHours: 24,
  maxBookingMonths: 12,
  capacityPerService: 70,
  autoApprovalLimit: 20,
  lateToleranceMinutes: 10,
  restaurantWhatsapp: '',
  whatsappMode: 'assisted',
};

function integer(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function time(value: unknown, fallback: string) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

export function normalizeOperationalSettings(value: Record<string, unknown> | undefined): OperationalSettings {
  return {
    lunchArrivalLimit: time(value?.lunchArrivalLimit, DEFAULT_OPERATIONAL_SETTINGS.lunchArrivalLimit),
    dinnerArrivalLimit: time(value?.dinnerArrivalLimit, DEFAULT_OPERATIONAL_SETTINGS.dinnerArrivalLimit),
    minAdvanceHours: integer(value?.minAdvanceHours, DEFAULT_OPERATIONAL_SETTINGS.minAdvanceHours, 1, 168),
    maxBookingMonths: integer(value?.maxBookingMonths, DEFAULT_OPERATIONAL_SETTINGS.maxBookingMonths, 1, 24),
    capacityPerService: integer(value?.capacityPerService, DEFAULT_OPERATIONAL_SETTINGS.capacityPerService, 1, 500),
    autoApprovalLimit: integer(value?.autoApprovalLimit, DEFAULT_OPERATIONAL_SETTINGS.autoApprovalLimit, 1, 200),
    lateToleranceMinutes: integer(value?.lateToleranceMinutes, DEFAULT_OPERATIONAL_SETTINGS.lateToleranceMinutes, 0, 120),
    restaurantWhatsapp: typeof value?.restaurantWhatsapp === 'string'
      ? value.restaurantWhatsapp.replace(/\D/g, '').slice(0, 13)
      : DEFAULT_OPERATIONAL_SETTINGS.restaurantWhatsapp,
    whatsappMode: 'assisted',
  };
}

export async function getOperationalSettings(database: Firestore) {
  const snapshot = await database.collection('systemSettings').doc('operational').get();
  return normalizeOperationalSettings(snapshot.data());
}
