export function createReservationCode(whatsapp: string, serviceDate: string) {
  const phone = whatsapp.replace(/\D/g, '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
  if (phone.length < 4 || !match) return '';
  const [, year, month, day] = match;
  return `${phone.slice(-4)}${day}${month}${year.slice(-2)}`;
}

export function reservationCode(data: Record<string, unknown>, legacyId = '') {
  const stored =
    typeof data.reservationCode === 'string' ? data.reservationCode.trim() : '';
  return (
    stored ||
    createReservationCode(
      typeof data.whatsapp === 'string' ? data.whatsapp : '',
      typeof data.serviceDate === 'string' ? data.serviceDate : '',
    ) ||
    legacyId
  );
}
