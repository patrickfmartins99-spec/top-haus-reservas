export function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) return `55${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalized = normalizeWhatsApp(phone);
  if (normalized.length < 12) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function reservationMessage(reservation: { id: string; customerName: string; serviceDate: string; arrivalTime: string; partySize: number; status?: string }) {
  const serviceDate = reservation.serviceDate.split('-').reverse().join('/');
  const situation = reservation.status === 'pending_approval'
    ? 'Recebemos sua solicitação e ela está aguardando aprovação da equipe.'
    : 'Sua reserva está confirmada.';
  return `Olá, ${reservation.customerName}! ${situation}\n\nData: ${serviceDate}\nChegada: ${reservation.arrivalTime}\nPessoas: ${reservation.partySize}\nCódigo: ${reservation.id}\n\nTop Haus Reservas`;
}
