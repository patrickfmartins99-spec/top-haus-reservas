export type OutcomeReason = {
  value: string;
  label: string;
};

export const RESERVATION_CANCELLATION_REASONS: OutcomeReason[] = [
  { value: 'customer_request', label: 'Solicitação do cliente' },
  { value: 'changed_plans', label: 'Mudança de planos' },
  { value: 'unexpected_event', label: 'Imprevisto' },
  { value: 'duplicate_booking', label: 'Reserva duplicada' },
  { value: 'booking_error', label: 'Erro no cadastro da reserva' },
  { value: 'other', label: 'Outro motivo' },
];

export const RESERVATION_NO_SHOW_REASONS: OutcomeReason[] = [
  { value: 'did_not_arrive', label: 'Cliente não chegou' },
  {
    value: 'late_tolerance_exceeded',
    label: 'Ultrapassou a tolerância de atraso',
  },
  { value: 'could_not_contact', label: 'Não foi possível contato' },
  { value: 'other', label: 'Outro motivo' },
];

export const WAITLIST_EXIT_REASONS: OutcomeReason[] = [
  { value: 'customer_gave_up', label: 'Cliente desistiu da espera' },
  { value: 'customer_left', label: 'Cliente saiu do local' },
  { value: 'wait_too_long', label: 'Tempo de espera' },
  { value: 'changed_plans', label: 'Mudança de planos' },
  { value: 'other', label: 'Outro motivo' },
];

export const WAITLIST_NO_SHOW_REASONS: OutcomeReason[] = [
  { value: 'did_not_answer', label: 'Não respondeu ao chamado' },
  { value: 'not_at_restaurant', label: 'Não estava mais no restaurante' },
  { value: 'hold_time_exceeded', label: 'Ultrapassou os 3 minutos do chamado' },
  { value: 'other', label: 'Outro motivo' },
];

export function outcomeReason(
  value: unknown,
  options: OutcomeReason[],
  note: unknown,
) {
  const reason = typeof value === 'string' ? value : '';
  const option = options.find((item) => item.value === reason);
  const normalizedNote =
    typeof note === 'string' ? note.trim().slice(0, 500) : '';

  if (!option) throw new Error('REASON_REQUIRED');
  if (option.value === 'other' && normalizedNote.length < 3) {
    throw new Error('REASON_DETAILS_REQUIRED');
  }

  return {
    reason: option.value,
    reasonLabel: option.label,
    note: normalizedNote,
  };
}
