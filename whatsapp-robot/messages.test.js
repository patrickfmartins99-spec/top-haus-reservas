const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMessage, normalizeBrazilianPhone } = require('./messages');

const reservation = {
  customerName: 'Patrick Martins',
  service: 'rodizio',
  serviceDate: '2026-09-20',
  arrivalTime: '19:00',
  partySize: 4,
  reservationCode: 'ABC123',
};

test('cria confirmação de reserva com todos os dados', () => {
  const message = buildMessage('reservation_confirmed', reservation);
  assert.match(message, /Olá, Patrick/);
  assert.match(message, /Rodízio/);
  assert.match(message, /20\/09\/2026/);
  assert.match(message, /19:00/);
  assert.match(message, /ABC123/);
});

test('informa alterações realizadas e os dados atuais', () => {
  const message = buildMessage('reservation_updated', {
    ...reservation,
    partySize: 6,
    arrivalTime: '18:45',
    notes: 'Aniversário',
    whatsapp: '47999999999',
    previous: { ...reservation, partySize: 4, arrivalTime: '19:00', notes: '', whatsapp: '47888888888' },
  });
  assert.match(message, /Horário: 19:00 → 18:45/);
  assert.match(message, /Número de pessoas: 4 → 6/);
  assert.match(message, /WhatsApp de contato: atualizado/);
  assert.match(message, /Observações: atualizadas/);
});

test('fila de espera não informa estimativa', () => {
  const message = buildMessage('waitlist_created', { customerName: 'Patrick', partySize: 3 });
  assert.match(message, /fila de espera/);
  assert.doesNotMatch(message, /estimativa|estimado|minuto/i);
});

test('chamada da fila informa prazo de três minutos', () => {
  const message = buildMessage('waitlist_called', { customerName: 'Patrick', holdMinutes: 3 });
  assert.match(message, /apenas 3 minutos/);
});

test('ações sem mensagem definida são ignoradas', () => {
  assert.equal(buildMessage('waitlist_seated', {}), null);
});

test('normaliza telefone brasileiro', () => {
  assert.equal(normalizeBrazilianPhone('(47) 99999-9999'), '5547999999999');
  assert.equal(normalizeBrazilianPhone('5547999999999'), '5547999999999');
  assert.equal(normalizeBrazilianPhone('123'), null);
});
