// Isolated contract tests: no credentials, network, real Firebase, or push delivery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let db, staff;
let serial = 0;
const stamp = () => ({ toDate: () => new Date(), toMillis: () => Date.now() });
class FakeDatabase {
  data = new Map();
  collection(name) {
    const self = this;
    return {
      doc(id = `fake-${++serial}`) {
        const key = `${name}/${id}`;
        return {
          id,
          key,
          collection: (child) => self.collection(`${key}/${child}`),
          get: async () => ({
            exists: self.data.has(key),
            data: () => self.data.get(key),
            id,
          }),
          set: async (data) => self.data.set(key, data),
        };
      },
    };
  }
  async runTransaction(callback) {
    const pending = [];
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, value, opts) =>
        pending.push(() =>
          this.data.set(
            ref.key,
            opts?.merge ? { ...this.data.get(ref.key), ...value } : value,
          ),
        ),
      update: (ref, value) =>
        pending.push(() =>
          this.data.set(ref.key, { ...this.data.get(ref.key), ...value }),
        ),
    };
    const result = await callback(tx);
    pending.forEach((write) => write());
    return result;
  }
  batch() {
    const pending = [];
    return {
      set: (ref, value, opts) =>
        pending.push(() =>
          this.data.set(
            ref.key,
            opts?.merge ? { ...this.data.get(ref.key), ...value } : value,
          ),
        ),
      update: (ref, value) =>
        pending.push(() =>
          this.data.set(ref.key, { ...this.data.get(ref.key), ...value }),
        ),
      commit: async () => pending.forEach((write) => write()),
    };
  }
}
const cache = new Map();
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full);
  const module = { exports: {} };
  cache.set(full, module.exports);
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    if (name === 'server-only') return {};
    if (name === 'next/server')
      return {
        NextResponse: { json: (data, init) => Response.json(data, init) },
        after: () => {},
      };
    if (name === 'firebase-admin/firestore')
      return { FieldValue: { serverTimestamp: stamp } };
    if (name === '@/lib/auth/staff-request')
      return { requireStaff: async () => staff };
    if (name === '@/lib/firebase/admin') return { getAdminDatabase: () => db };
    if (name === 'web-push')
      return {
        generateVAPIDKeys: () => ({
          publicKey: 'public-test-key',
          privateKey: 'private-test-key',
        }),
        sendNotification: () => {
          throw new Error('Network prohibited in unit tests');
        },
      };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.'))
      return load(
        path.relative(root, path.resolve(path.dirname(full), `${name}.ts`)),
      );
    return require(name);
  };
  new Function('require', 'module', 'exports', source)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}
const domain = load('lib/domain/reservations.ts');
const outcomes = load('lib/domain/service-outcomes.ts');
const reporting = load('lib/domain/reporting.ts');
const messages = load('lib/whatsapp.ts');
const deletion = load('lib/firebase/delete-reservation.ts');
const routes = load('app/api/reservas/[id]/route.ts');
const createRoute = load('app/api/reservas/route.ts');
const waitlistOutcomeRoute = load('app/api/fila/[id]/route.ts');
const notifications = load('lib/firebase/reservation-notifications.ts');
const clientRoute = load('app/api/minha-reserva/route.ts');
const customerNotificationsRoute = load(
  'app/api/cliente/notificacoes/route.ts',
);
const staffPushRoute = load('app/api/equipe/notificacoes/route.ts');
const input = {
  service: 'rodizio',
  serviceDate: '2026-12-12',
  arrivalTime: '19:00',
  partySize: 4,
  customerName: 'Cliente Teste',
  whatsapp: '47999990000',
  notes: '',
};
function fixture(status = 'confirmed') {
  db = new FakeDatabase();
  staff = { decodedToken: { uid: 'test-staff' } };
  db.data.set('reservations/r1', {
    ...input,
    status,
    tableLabel: '',
    confirmationTokenHash: notifications.hash('a'.repeat(48)),
  });
  db.data.set('serviceCapacity/2026-12-12_rodizio', {
    heldSeats: status === 'cancelled' ? 6 : 10,
  });
}
function request(method, data) {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
const routeParams = { params: Promise.resolve({ id: 'r1' }) };

test('rodízio aceita 17:59 e 18:00, recusa após 18h em Brasília', () => {
  assert.equal(
    domain.canBook(input, 24, Date.parse('2026-12-12T17:59:59-03:00')),
    true,
  );
  assert.equal(
    domain.canBook(input, 24, Date.parse('2026-12-12T18:00:00-03:00')),
    true,
  );
  assert.equal(
    domain.canBook(input, 24, Date.parse('2026-12-12T18:00:01-03:00')),
    false,
  );
  assert.equal(
    domain.canBook(input, 24, Date.parse('2026-12-13T01:00:00-03:00')),
    false,
  );
});
test('almoço mantém exatamente 24h de antecedência', () => {
  const lunch = { ...input, service: 'almoco', arrivalTime: '11:30' };
  assert.equal(
    domain.canBook(lunch, 24, Date.parse('2026-12-11T11:30:00-03:00')),
    true,
  );
  assert.equal(
    domain.canBook(lunch, 24, Date.parse('2026-12-11T11:30:01-03:00')),
    false,
  );
});
test('calendário roda no fuso do restaurante', () => {
  assert.equal(
    domain.minimumBookingDate(
      'rodizio',
      24,
      Date.parse('2026-12-12T20:00:00Z'),
    ),
    '2026-12-12',
  );
  assert.equal(
    domain.minimumBookingDate(
      'rodizio',
      24,
      Date.parse('2026-12-12T22:00:00Z'),
    ),
    '2026-12-13',
  );
});
test('datas impossíveis são rejeitadas', () => {
  assert.equal(domain.isReservationInput(input), true);
  assert.equal(
    domain.isReservationInput({ ...input, serviceDate: '2026-02-31' }),
    false,
  );
});
test('exclusão libera capacidade uma única vez e mantém auditoria e sino', async () => {
  fixture();
  await deletion.deleteReservation(db, 'r1', {
    type: 'staff',
    id: 'test-staff',
    reason: 'unexpected_event',
  });
  await deletion.deleteReservation(db, 'r1', {
    type: 'staff',
    id: 'test-staff',
    reason: 'unexpected_event',
  });
  assert.equal(db.data.get('serviceCapacity/2026-12-12_rodizio').heldSeats, 6);
  assert.ok(db.data.get('reservations/r1').deletedAt);
  assert.equal(
    db.data.get('reservations/r1').cancellationReasonLabel,
    'Imprevisto',
  );
  assert.equal(
    [...db.data.keys()].filter((key) => key.startsWith('auditLogs/')).length,
    1,
  );
  const event = [...db.data.entries()].find(([key]) =>
    key.startsWith('whatsappQueue/'),
  )[1];
  assert.equal(event.status, 'manual_pending');
  assert.equal(event.eventType, 'reservation_cancelled');
  assert.equal(
    [...db.data.keys()].filter((key) =>
      key.startsWith('reservations/r1/notifications/'),
    ).length,
    1,
  );
});
test('excluir reserva já cancelada não libera capacidade novamente', async () => {
  fixture('cancelled');
  await deletion.deleteReservation(db, 'r1', {
    type: 'staff',
    id: 'test-staff',
    reason: 'customer_request',
  });
  assert.equal(db.data.get('serviceCapacity/2026-12-12_rodizio').heldSeats, 6);
});
test('cliente errado não pode excluir e não gera escrita', async () => {
  fixture();
  await assert.rejects(
    () =>
      deletion.deleteReservation(db, 'r1', {
        type: 'customer',
        id: null,
        whatsapp: '47000000000',
      }),
    /NOT_FOUND/,
  );
  assert.equal(db.data.size, 2);
});
test('cliente não exclui dentro de 24h, colaborador pode', async () => {
  fixture();
  db.data.get('reservations/r1').serviceDate = '2020-01-01';
  await assert.rejects(
    () =>
      deletion.deleteReservation(db, 'r1', {
        type: 'customer',
        id: null,
        whatsapp: input.whatsapp,
      }),
    /DEADLINE/,
  );
  assert.equal(db.data.size, 2);
});
test('rota de exclusão exige colaborador', async () => {
  fixture();
  staff = null;
  const response = await routes.DELETE(request('DELETE', {}), routeParams);
  assert.equal(response.status, 403);
  assert.equal(db.data.size, 2);
});
test('mesa é salva sem alterar reserva, capacidade ou notificar cliente', async () => {
  fixture();
  const response = await routes.PATCH(
    request('PATCH', { action: 'assign_table', tableLabel: ' 12 + 13 ' }),
    routeParams,
  );
  assert.equal(response.status, 200);
  assert.equal(db.data.get('reservations/r1').tableLabel, '12 + 13');
  assert.equal(db.data.get('reservations/r1').partySize, 4);
  assert.equal(db.data.get('serviceCapacity/2026-12-12_rodizio').heldSeats, 10);
  assert.equal(
    [...db.data.keys()].some((key) => key.startsWith('whatsappQueue/')),
    false,
  );
});
test('mesa longa rejeitada e reserva excluída não aceita edição', async () => {
  fixture();
  assert.equal(
    (
      await routes.PATCH(
        request('PATCH', {
          action: 'assign_table',
          tableLabel: 'x'.repeat(41),
        }),
        routeParams,
      )
    ).status,
    400,
  );
  db.data.get('reservations/r1').deletedAt = stamp();
  assert.equal(
    (
      await routes.PATCH(
        request('PATCH', { action: 'assign_table', tableLabel: '9' }),
        routeParams,
      )
    ).status,
    404,
  );
});
test('criação não aceita campos administrativos injetados pelo cliente', async () => {
  fixture();
  const response = await createRoute.POST(
    request('POST', {
      ...input,
      deletedAt: 'injetado',
      tableLabel: '99',
      source: 'staff',
      status: 'seated',
    }),
  );
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const saved = db.data.get(`reservations/${id}`);
  assert.equal(saved.deletedAt, undefined);
  assert.equal(saved.tableLabel, undefined);
  assert.equal(saved.status, 'confirmed');
  assert.equal(saved.source, 'customer_web');
});
test('criação de rodízio após prazo é barrada no servidor', async () => {
  fixture();
  const response = await createRoute.POST(
    request('POST', { ...input, serviceDate: '2020-01-01' }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /18h/);
});
test('token de notificação só permite sua própria reserva', async () => {
  fixture();
  const token = 'a'.repeat(48);
  assert.deepEqual(
    await notifications.verifiedAccess(db, [{ id: 'r1', token }]),
    ['r1'],
  );
  assert.deepEqual(
    await notifications.verifiedAccess(db, [
      { id: 'r1', token: 'b'.repeat(48) },
    ]),
    [],
  );
  assert.deepEqual(
    await notifications.verifiedAccess(db, [{ id: '../r1', token }]),
    [],
  );
});
test('push rejeita destino arbitrário e chaves inválidas', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
  };
  assert.equal(notifications.validSubscription(sub), true);
  for (const endpoint of [
    'http://localhost/test',
    'https://127.0.0.1/test',
    'https://fcm.googleapis.com.attacker.example/test',
    'https://fcm.googleapis.com:444/test',
  ])
    assert.equal(notifications.validSubscription({ ...sub, endpoint }), false);
});
test('consulta não expõe reserva excluída nem aceita caminho inválido', async () => {
  fixture();
  db.data.get('reservations/r1').deletedAt = stamp();
  assert.equal(
    (
      await clientRoute.POST(
        request('POST', { code: 'r1', whatsapp: input.whatsapp }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await clientRoute.POST(
        request('POST', { code: '../r1', whatsapp: input.whatsapp }),
      )
    ).status,
    400,
  );
});
test('textos distinguem análise, confirmação e cancelamento', () => {
  assert.match(
    messages.customerMessage('reservation_pending_approval', input),
    /ainda não está confirmada/,
  );
  assert.match(
    messages.reservationMessage({ ...input, id: 'r1', status: 'cancelled' }),
    /foi cancelada/,
  );
  assert.match(
    messages.customerMessage('reservation_updated', {
      ...input,
      previous: { ...input, partySize: 2 },
    }),
    /Pessoas: 2 → \*4\*/,
  );
});
test('fila sem estimativa, chamada de três minutos e DDD55 correto', () => {
  assert.doesNotMatch(
    messages.customerMessage('waitlist_created', input),
    /\d+ minutos/,
  );
  assert.match(messages.customerMessage('waitlist_called', input), /3 minutos/);
  assert.equal(messages.normalizeWhatsApp('55999990000'), '5555999990000');
});

test('cliente não pode cadastrar push nem consultar a chave de envio', async () => {
  fixture();
  for (const action of ['config', 'subscribe', 'unsubscribe']) {
    const result = await customerNotificationsRoute.POST(
      request('POST', {
        action,
        accesses: [{ id: 'r1', token: 'a'.repeat(48) }],
      }),
    );
    assert.equal(result.status, 400);
  }
  assert.equal(db.data.size, 2);
});
test('notificações móveis exigem sessão de colaborador', async () => {
  fixture();
  staff = null;
  for (const action of ['config', 'subscribe', 'test'])
    assert.equal(
      (await staffPushRoute.POST(request('POST', { action }))).status,
      403,
    );
  assert.equal(db.data.size, 2);
});
test('colaborador cadastra somente seu aparelho; outro usuário não pode assumir inscrição', async () => {
  fixture();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
  };
  assert.equal(
    (
      await staffPushRoute.POST(
        request('POST', { action: 'subscribe', subscription }),
      )
    ).status,
    200,
  );
  const saved = db.data.get(
    `staffPushSubscriptions/${notifications.hash(subscription.endpoint)}`,
  );
  assert.equal(saved.uid, 'test-staff');
  assert.ok(saved.expiresAt > Date.now());
  staff = { decodedToken: { uid: 'another-staff' } };
  for (const action of ['subscribe', 'unsubscribe', 'test'])
    assert.equal(
      (await staffPushRoute.POST(request('POST', { action, subscription })))
        .status,
      409,
    );
});
test('evento da reserva gera push só da equipe e aviso interno do cliente', async () => {
  fixture();
  await deletion.deleteReservation(db, 'r1', {
    type: 'staff',
    id: 'test-staff',
    reason: 'changed_plans',
  });
  const event = [...db.data.entries()].find(([key]) =>
    key.startsWith('staffNotifications/'),
  )[1];
  assert.equal(event.pushStatus, 'pending');
  assert.match(event.href, /^\/painel\//);
  const customerEvent = [...db.data.entries()].find(([key]) =>
    key.startsWith('reservations/r1/notifications/'),
  )[1];
  assert.equal(customerEvent.channel, 'in_app');
  assert.equal(customerEvent.pushStatus, undefined);
  assert.equal(
    [...db.data.keys()].some((key) => key.includes('pushSubscriptions')),
    false,
  );
});
test('textos usam destaque e evitam repetir apresentação da equipe', () => {
  assert.match(
    messages.customerMessage('reservation_confirmed', input),
    /\*Sua reserva está confirmada!\*/,
  );
  for (const event of [
    'reservation_updated',
    'reservation_cancelled',
    'waitlist_called',
  ])
    assert.doesNotMatch(
      messages.customerMessage(event, input),
      /Aqui é a equipe/,
    );
});

test('encerramentos exigem motivo válido e detalhes quando marcado como outro', () => {
  assert.throws(
    () =>
      outcomes.outcomeReason('', outcomes.RESERVATION_CANCELLATION_REASONS, ''),
    /REASON_REQUIRED/,
  );
  assert.throws(
    () => outcomes.outcomeReason('other', outcomes.WAITLIST_EXIT_REASONS, ''),
    /REASON_DETAILS_REQUIRED/,
  );
  assert.deepEqual(
    outcomes.outcomeReason(
      'unexpected_event',
      outcomes.RESERVATION_CANCELLATION_REASONS,
      'Chuva forte',
    ),
    {
      reason: 'unexpected_event',
      reasonLabel: 'Imprevisto',
      note: 'Chuva forte',
    },
  );
});

test('chegada e no show saem da operação e deixam trilha para relatório', async () => {
  fixture();
  let response = await routes.PATCH(
    request('PATCH', { action: 'set_status', status: 'seated' }),
    routeParams,
  );
  assert.equal(response.status, 200);
  assert.equal(db.data.get('reservations/r1').status, 'seated');
  assert.ok(
    [...db.data.values()].some((item) => item.action === 'reservation_arrived'),
  );

  fixture();
  response = await routes.PATCH(
    request('PATCH', {
      action: 'set_status',
      status: 'no_show',
      reason: 'late_tolerance_exceeded',
    }),
    routeParams,
  );
  assert.equal(response.status, 200);
  assert.equal(db.data.get('reservations/r1').status, 'no_show');
  assert.equal(db.data.get('serviceCapacity/2026-12-12_rodizio').heldSeats, 6);
  assert.equal(
    db.data.get('reservations/r1').outcomeReasonLabel,
    'Ultrapassou a tolerância de atraso',
  );
});

test('saída da fila exige motivo e registra o desfecho', async () => {
  fixture();
  db.data.set('waitlist/w1', {
    customerName: 'Cliente Fila',
    whatsapp: input.whatsapp,
    partySize: 3,
    status: 'called',
  });
  const params = { params: Promise.resolve({ id: 'w1' }) };
  let response = await waitlistOutcomeRoute.PATCH(
    request('PATCH', { status: 'removed' }),
    params,
  );
  assert.equal(response.status, 400);
  response = await waitlistOutcomeRoute.PATCH(
    request('PATCH', { status: 'removed', reason: 'customer_gave_up' }),
    params,
  );
  assert.equal(response.status, 200);
  assert.equal(db.data.get('waitlist/w1').status, 'removed');
  assert.equal(
    db.data.get('waitlist/w1').exitReasonLabel,
    'Cliente desistiu da espera',
  );
  assert.ok(
    [...db.data.values()].some(
      (item) =>
        item.action === 'waitlist_status_changed' &&
        item.toStatus === 'removed',
    ),
  );
});

test('relatório calcula movimento, cancelamentos, frequência e fila', () => {
  const report = reporting.buildOperationalReport(
    [
      {
        id: '1',
        customerName: 'Ana',
        whatsapp: '47999999999',
        partySize: 4,
        serviceDate: '2026-09-03',
        status: 'seated',
      },
      {
        id: '2',
        customerName: 'Ana',
        whatsapp: '47999999999',
        partySize: 2,
        serviceDate: '2026-09-04',
        status: 'completed',
      },
      {
        id: '3',
        customerName: 'Bruno',
        whatsapp: '47888888888',
        partySize: 3,
        serviceDate: '2026-09-04',
        status: 'cancelled',
        cancelledAt: '2026-09-04T14:00:00-03:00',
        cancellationActorType: 'staff',
        cancellationReasonLabel: 'Imprevisto',
      },
      {
        id: '4',
        customerName: 'Carla',
        whatsapp: '47777777777',
        partySize: 2,
        serviceDate: '2026-09-04',
        status: 'no_show',
        noShowAt: '2026-09-04T20:00:00-03:00',
        outcomeReasonLabel: 'Cliente não chegou',
      },
    ],
    [
      {
        partySize: 2,
        status: 'seated',
        enteredAt: '2026-09-04T18:00:00-03:00',
        seatedAt: '2026-09-04T18:20:00-03:00',
      },
      {
        partySize: 3,
        status: 'removed',
        enteredAt: '2026-09-04T18:10:00-03:00',
      },
    ],
    30,
    '2026-09-04',
  );
  assert.equal(report.summary.reservations, 2);
  assert.equal(report.summary.cancellations, 2);
  assert.equal(report.summary.averageWaitMinutes, 20);
  assert.equal(report.frequentCustomers[0].customerName, 'Ana');
  assert.equal(report.frequentCustomers[0].visits, 2);
  assert.equal(report.cancellations[0].reason, 'Cliente não chegou');
});
