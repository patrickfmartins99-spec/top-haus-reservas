export function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalized = normalizeWhatsApp(phone);
  if (normalized.length < 12) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export const messageTitles: Record<string, string> = {
  reservation_confirmed: 'Reserva confirmada', reservation_pending_approval: 'Solicitação recebida',
  reservation_approved: 'Reserva aprovada', reservation_updated: 'Reserva alterada',
  reservation_cancelled: 'Reserva cancelada', reservation_presence_confirmed: 'Presença confirmada',
  reservation_no_show: 'Reserva encerrada por ausência', reservation_seated: 'Boas-vindas ao Top Haus', reservation_completed: 'Obrigado pela visita',
  waitlist_created: 'Entrada na fila', waitlist_updated: 'Dados da fila atualizados',
  waitlist_called: 'Sua mesa está disponível', waitlist_seated: 'Boas-vindas ao Top Haus', waitlist_removed: 'Saída da fila',
};

export type MessageData = { customerName?: string; serviceDate?: string; arrivalTime?: string; partySize?: number; service?: string; reservationCode?: string; status?: string; toStatus?: string; previous?: Record<string, unknown>; lateToleranceMinutes?: number };
function textValue(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

export function customerMessage(event: string, data: MessageData) {
  const name = data.customerName || 'tudo bem';
  const intro = ['reservation_confirmed', 'reservation_pending_approval', 'waitlist_created'].includes(event) ? ' Aqui é a equipe do Top Haus. 🤎' : ' 🤎';
  const hello = `Olá, ${name}!${intro}`;
  const date = data.serviceDate?.split('-').reverse().join('/') ?? '';
  const details = `📅 *${date}* · *${data.service === 'almoco' ? 'Almoço' : 'Rodízio'}*\n🕒 Chegada: *${data.arrivalTime ?? ''}*\n👥 *${data.partySize ?? 1} pessoa(s)*\n🔖 Código: *${data.reservationCode ?? ''}*`;
  const rules = `Tolerância de *${data.lateToleranceMinutes ?? 10} minutos* após o horário combinado. Alterações e cancelamentos pelo site até *24h antes*; depois, fale com a equipe.`;
  if (event === 'reservation_pending_approval') return `${hello}\n\nRecebemos o pedido para o seu grupo e vamos conferir os detalhes com carinho. A reserva *ainda não está confirmada*.\n\n${details}\n\nAcompanhe a aprovação pelo site. Se precisar de algo, fale com a gente!`;
  if (event === 'reservation_confirmed' || event === 'reservation_approved') return `${hello}\n\n${event === 'reservation_approved' ? '*Sua reserva foi aprovada!*' : '*Sua reserva está confirmada!*'} Vai ser um prazer receber vocês.\n\n${details}\n\n${rules}\n\nAté breve no Top Haus!`;
  if (event === 'reservation_cancelled') return `${hello}\n\nSua reserva *foi cancelada* e os lugares foram liberados. Sentimos muito por não receber vocês desta vez!\n\n${details}\n\nSe não era o esperado, responda por aqui. Esperamos vocês em outra oportunidade!`;
  if (event === 'reservation_updated') {
    const labels: Record<string, string> = { serviceDate: 'Data', service: 'Serviço', arrivalTime: 'Chegada', partySize: 'Pessoas', customerName: 'Responsável' };
    const format = (key: string, value: unknown) => key === 'serviceDate' ? textValue(value).split('-').reverse().join('/') : key === 'service' ? (value === 'almoco' ? 'Almoço' : 'Rodízio') : textValue(value);
    const changes = Object.entries(labels).filter(([key]) => data.previous && textValue(data.previous[key]) !== textValue(data[key as keyof MessageData])).map(([key, label]) => `• ${label}: ${format(key, data.previous![key])} → *${format(key, data[key as keyof MessageData])}*`).join('\n');
    const pending = (data.toStatus ?? data.status) === 'pending_approval';
    return `${hello}\n\n*Atualizamos sua reserva.*${changes ? `\n\n${changes}` : ''}\n\n${details}\n\n${pending ? '*Aguarde a aprovação da equipe; a reserva ainda não está confirmada.*' : 'Confira se ficou tudo como combinado. Se precisar de ajuda, estamos por aqui!'}\n\nEsperamos vocês no Top Haus!`;
  }
  if (event === 'reservation_presence_confirmed') return `${hello}\n\n*Presença confirmada!* Obrigado por avisar. Estamos esperando vocês!\n\n${details}\n\nLembre-se da tolerância de *${data.lateToleranceMinutes ?? 10} minutos*. Até breve!`;
  if (event === 'reservation_no_show') return `${hello}\n\nSua reserva *foi encerrada por ausência* dentro do prazo de chegada. Sentimos falta de vocês!\n\n${details}\n\nAinda estão a caminho? Fale com a equipe para conferirmos a disponibilidade, sem garantia dos lugares anteriores.`;
  if (event === 'waitlist_created') return `${hello}\n\nVocês já estão na *fila de espera para ${data.partySize ?? 1} pessoa(s)*. Obrigado pela paciência!\n\nFiquem por perto e de olho neste WhatsApp: chamaremos assim que houver uma mesa para o grupo. Se precisarem sair ou alterar os dados, avisem a recepção. Até breve!`;
  if (event === 'waitlist_called') return `${hello}\n\n*Chegou a vez de vocês!* 🎉 Temos uma mesa para *${data.partySize ?? 1} pessoa(s)*.\n\nVenham à *recepção agora* e informem o nome da lista. A mesa ficará disponível por apenas *3 minutos a partir desta chamada*; depois, poderemos chamar o próximo grupo.\n\nEstamos esperando vocês!`;
  if (event === 'waitlist_updated') return `${hello}\n\n*Atualizamos os dados da fila:* ${name}, grupo de *${data.partySize ?? 1} pessoa(s)*.\n\nFiquem por perto: chamaremos por aqui quando houver uma mesa para vocês. Obrigado por nos avisar!`;
  if (event === 'waitlist_removed') return `${hello}\n\nSeu nome *foi retirado da fila de espera*. Agradecemos pela paciência e sentimos muito por não receber vocês desta vez.\n\nSe não era o esperado, procurem a recepção. Esperamos vocês em outra oportunidade!`;
  if (event === 'reservation_completed') return `${hello}\n\n*Obrigado pela visita!* Foi um prazer receber vocês no Top Haus. Esperamos que tenham aproveitado!\n\nSe quiserem contar como foi a experiência, estamos por aqui. Até a próxima!`;
  return `${hello}\n\n*Sejam bem-vindos ao Top Haus!* A chegada de vocês foi registrada. Nossa equipe está à disposição. Aproveitem a visita!`;
}

export function reservationMessage(reservation: MessageData & { id: string }) {
  const event = reservation.status === 'cancelled' ? 'reservation_cancelled' : reservation.status === 'pending_approval' ? 'reservation_pending_approval' : reservation.status === 'no_show' ? 'reservation_no_show' : reservation.status === 'completed' ? 'reservation_completed' : reservation.status === 'seated' ? 'reservation_seated' : reservation.status === 'presence_confirmed' ? 'reservation_presence_confirmed' : 'reservation_confirmed';
  return customerMessage(event, { ...reservation, reservationCode: reservation.id });
}
