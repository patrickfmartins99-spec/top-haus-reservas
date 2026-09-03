function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeBrazilianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function firstName(value) {
  return String(value || 'cliente').trim().split(/\s+/)[0] || 'cliente';
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || 'A confirmar');
}

function serviceLabel(value) {
  if (value === 'almoco') return 'Almoço';
  if (value === 'rodizio') return 'Rodízio';
  return String(value || 'A confirmar');
}

function reservationDetails(payload) {
  return [
    `🍽️ Serviço: ${serviceLabel(payload.service)}`,
    `📅 Data: ${formatDate(payload.serviceDate)}`,
    `🕐 Horário de chegada: ${payload.arrivalTime || 'A confirmar'}`,
    `👥 Pessoas: ${payload.partySize || 'A confirmar'}`,
    `🔖 Código da reserva: ${payload.reservationCode || 'A confirmar'}`,
  ].join('\n');
}

function changedReservationLines(payload) {
  const previous = payload.previous;
  if (!previous || typeof previous !== 'object') return [];

  const fields = [
    ['customerName', 'Nome da reserva', (value) => String(value || 'A confirmar')],
    ['service', 'Serviço', serviceLabel],
    ['serviceDate', 'Data', formatDate],
    ['arrivalTime', 'Horário', (value) => String(value || 'A confirmar')],
    ['partySize', 'Número de pessoas', (value) => String(value || 'A confirmar')],
  ];

  const changes = fields.flatMap(([key, label, formatter]) => {
    if (String(previous[key] ?? '') === String(payload[key] ?? '')) return [];
    return [`• ${label}: ${formatter(previous[key])} → ${formatter(payload[key])}`];
  });

  if (String(previous.whatsapp ?? '').replace(/\D/g, '') !== String(payload.whatsapp ?? '').replace(/\D/g, '')) {
    changes.push('• WhatsApp de contato: atualizado');
  }
  if (String(previous.notes ?? '') !== String(payload.notes ?? '')) {
    changes.push('• Observações: atualizadas');
  }

  return changes;
}

function buildMessage(eventType, payload) {
  const name = firstName(payload.customerName);

  if (eventType === 'reservation_confirmed') {
    return `Olá, ${name}! 😊\n\nQue alegria receber sua reserva no Top Haus! Ela já está confirmada.\n\n${reservationDetails(payload)}\n\nSe precisar falar com a nossa equipe, responda esta mensagem. Esperamos você! 🤎`;
  }

  if (eventType === 'reservation_pending_approval') {
    return `Olá, ${name}! 😊\n\nRecebemos sua solicitação de reserva no Top Haus. Como se trata de um grupo maior, nossa equipe fará uma rápida conferência antes da confirmação.\n\n${reservationDetails(payload)}\n\nAssim que a análise terminar, avisaremos você por aqui. 🤎`;
  }

  if (eventType === 'reservation_approved') {
    return `Olá, ${name}! 🎉\n\nSua solicitação foi aprovada e a reserva no Top Haus está confirmada!\n\n${reservationDetails(payload)}\n\nEstamos preparando tudo para receber você e seu grupo. Até breve! 🤎`;
  }

  if (eventType === 'reservation_cancelled') {
    return `Olá, ${name}. 😔\n\nSentimos que você não poderá estar conosco desta vez. Sua reserva no Top Haus foi cancelada.\n\n${reservationDetails(payload)}\n\nEsperamos ter a oportunidade de receber você em outra ocasião. Quando quiser voltar, será um prazer! 🤎`;
  }

  if (eventType === 'reservation_updated') {
    const changes = changedReservationLines(payload);
    const changeText = changes.length > 0
      ? `Estas foram as alterações realizadas:\n${changes.join('\n')}\n\n`
      : '';
    const approvalText = payload.toStatus === 'pending_approval'
      ? '\n\nComo a nova quantidade é superior a 20 pessoas, a alteração está aguardando aprovação da equipe.'
      : '';
    return `Olá, ${name}! 😊\n\nSua reserva no Top Haus foi atualizada com sucesso.\n\n${changeText}Confira os dados atuais:\n${reservationDetails(payload)}${approvalText}\n\nSe alguma informação não estiver correta, responda esta mensagem para falar com a equipe. 🤎`;
  }

  if (eventType === 'waitlist_created') {
    return `Olá, ${name}! 😊\n\nVocê e seu grupo de ${payload.partySize || '—'} pessoa(s) foram incluídos na fila de espera do Top Haus.\n\nAssim que sua mesa estiver pronta, vamos chamar você por aqui. Pedimos apenas que permaneça por perto. Até já! 🤎`;
  }

  if (eventType === 'waitlist_updated') {
    return `Olá, ${name}! 😊\n\nOs dados do seu grupo na fila de espera do Top Haus foram atualizados para ${payload.partySize || '—'} pessoa(s). Você continua na fila e será chamado por aqui assim que a mesa estiver pronta. 🤎`;
  }

  if (eventType === 'waitlist_called') {
    const holdMinutes = positiveNumber(payload.holdMinutes, 3);
    return `Olá, ${name}! 🎉\n\nSua mesa no Top Haus está pronta! Por favor, dirija-se agora à recepção e informe seu nome.\n\nA mesa ficará disponível por apenas ${holdMinutes} minutos. Estamos esperando por você! 🤎`;
  }

  return null;
}

module.exports = {
  buildMessage,
  normalizeBrazilianPhone,
  positiveNumber,
};
