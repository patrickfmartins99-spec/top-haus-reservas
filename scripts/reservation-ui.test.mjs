import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const output = new URL('../../../validation-reservations/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
  handleSIGINT: false,
});
const page = await browser.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
await page.setRequestInterception(true);
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
}).format(new Date());
const reservation = {
  id: 'teste-ui',
  customerName: 'Mariana Teste',
  whatsapp: '47999990000',
  partySize: 4,
  service: 'rodizio',
  serviceDate: today,
  arrivalTime: '19:00',
  status: 'confirmed',
  source: 'customer_web',
  notes: '',
  tableLabel: '',
  cancellationReason: '',
  cancellationReasonLabel: '',
  cancellationNote: '',
  outcomeReason: '',
  outcomeReasonLabel: '',
  outcomeNote: '',
  canModify: true,
  modifyDeadline: '2026-12-11T22:00:00Z',
  lateToleranceMinutes: 10,
  restaurantWhatsapp: '',
};
const settings = {
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
let deleted = false,
  savedTable = false,
  cancellationReasonSeen = '',
  queueOutcome = '';
let testRole = 'admin';
let profile = {
  uid: 'staff-test',
  username: 'stafftest',
  displayName: 'Equipe Teste',
  photo: '',
};
let editedUser = false;
const teamUser = {
  uid: 'another',
  username: 'colaborador',
  displayName: 'Colaborador Teste',
  role: 'staff',
  disabled: false,
};
const queueEntry = {
  id: 'fila-test',
  customerName: 'Cliente da Fila',
  whatsapp: '47999998888',
  partySize: 3,
  status: 'called',
  enteredAt: new Date(Date.now() - 20 * 60000).toISOString(),
  calledAt: new Date(Date.now() - 2 * 60000).toISOString(),
};
const report = {
  period: { days: 30, startDate: today, endDate: today },
  summary: {
    reservations: 12,
    people: 38,
    averageReservationsPerDay: 2.4,
    cancellations: 2,
    noShowRate: 8.3,
    averageWaitMinutes: 18,
  },
  daily: [{ date: today, label: '04/09', reservations: 4, people: 12 }],
  busiestDays: [{ date: today, label: '04/09', reservations: 4, people: 12 }],
  cancellations: [
    {
      id: 'cancel-test',
      customerName: 'Cliente Cancelado',
      serviceDate: today,
      occurredAt: new Date().toISOString(),
      type: 'Cancelamento',
      actor: 'Equipe',
      reason: 'Imprevisto',
      note: '',
    },
  ],
  frequentCustomers: [
    {
      customerName: 'Cliente Frequente',
      visits: 3,
      people: 8,
      lastVisit: today,
    },
  ],
  waitlistOutcomes: [
    { label: 'Atendidos', value: 4 },
    { label: 'Saíram da fila', value: 1 },
    { label: 'No show', value: 1 },
  ],
};
const message = {
  id: 'msg-test',
  title: 'Reserva confirmada',
  customerName: reservation.customerName,
  whatsapp: reservation.whatsapp,
  message:
    'Olá, Mariana! Sua reserva está confirmada. Estamos esperando vocês no Top Haus.',
  warning: '',
  createdAt: new Date().toISOString(),
};
const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'staff-test', user_id: 'staff-test', email: 'staff@example.com', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' } })).toString('base64url')}.test`;
page.on('request', async (request) => {
  const url = new URL(request.url());
  const reply = (body) =>
    request.respond({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(body),
    });
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    if (url.pathname.includes('signInWithPassword'))
      return reply({
        idToken: jwt,
        refreshToken: 'test-refresh',
        expiresIn: '3600',
        localId: 'staff-test',
        email: 'staff@example.com',
        registered: true,
        displayName: 'Equipe Teste',
      });
    return reply({
      users: [
        {
          localId: 'staff-test',
          email: 'staff@example.com',
          displayName: 'Equipe Teste',
          providerUserInfo: [
            {
              providerId: 'password',
              email: 'staff@example.com',
              federatedId: 'staff@example.com',
            },
          ],
        },
      ],
    });
  }
  if (url.hostname === 'securetoken.googleapis.com')
    return reply({
      access_token: jwt,
      id_token: jwt,
      refresh_token: 'test-refresh',
      expires_in: '3600',
      user_id: 'staff-test',
      project_id: 'test',
    });
  if (url.hostname !== 'localhost') return request.abort();
  if (!url.pathname.startsWith('/api/')) return request.continue();
  const body = request.postData() ? JSON.parse(request.postData()) : {};
  if (url.pathname === '/api/conta') {
    if (request.method() === 'PATCH') {
      profile = { ...profile, ...body };
      return reply({ ok: true, signInAgain: false });
    }
    return reply({ profile: { ...profile, role: testRole } });
  }
  if (url.pathname === '/api/configuracoes') return reply({ settings });
  if (url.pathname === '/api/admin/usuarios/another') {
    if (request.method() === 'PATCH') {
      editedUser = true;
      Object.assign(teamUser, body);
      return reply({ ok: true });
    }
    return reply({ photo: '' });
  }
  if (url.pathname === '/api/admin/usuarios')
    return reply({ users: [teamUser] });
  if (url.pathname === '/api/relatorios') return reply({ report });
  if (url.pathname === '/api/configuracoes/publicas')
    return reply({ settings });
  if (url.pathname === '/api/status') return reply({ firebase: 'connected' });
  if (url.pathname === '/api/reservas' && request.method() === 'GET')
    return reply({ reservations: deleted ? [] : [reservation] });
  if (url.pathname === '/api/reservas' && request.method() === 'POST')
    return reply({
      id: reservation.id,
      status: 'confirmed',
      token: 'a'.repeat(48),
    });
  if (
    url.pathname === '/api/reservas/teste-ui' &&
    request.method() === 'PATCH'
  ) {
    if (body.action === 'assign_table') {
      reservation.tableLabel = body.tableLabel;
      savedTable = true;
      return reply({ ok: true, tableLabel: body.tableLabel });
    }
    reservation.status = body.status;
    return reply({ ok: true, status: body.status });
  }
  if (
    url.pathname === '/api/reservas/teste-ui' &&
    request.method() === 'DELETE'
  ) {
    cancellationReasonSeen = body.reason;
    deleted = true;
    return reply({ ok: true });
  }
  if (url.pathname === '/api/minha-reserva')
    return reply({ reservation, notificationToken: 'b'.repeat(64) });
  if (url.pathname === '/api/cliente/notificacoes')
    return reply({
      items: [
        {
          id: 'notification-1',
          reservationId: reservation.id,
          title: 'Reserva confirmada',
          body: message.message,
          createdAt: message.createdAt,
        },
      ],
    });
  if (url.pathname === '/api/fila/fila-test') {
    queueOutcome = body.status;
    queueEntry.status = body.status;
    return reply({ ok: true });
  }
  if (url.pathname === '/api/fila')
    return reply({
      entries: ['seated', 'removed', 'no_show'].includes(queueEntry.status)
        ? []
        : [queueEntry],
    });
  if (url.pathname === '/api/notificacoes')
    return reply({
      items: [
        {
          id: 'manual_messages',
          title: 'Mensagens aguardando envio manual',
          description: '1 mensagem',
          href: '/painel/mensagens',
        },
      ],
    });
  if (url.pathname === '/api/mensagens') return reply({ items: [message] });
  return reply({ error: 'API não prevista pelo teste' });
});
async function click(text) {
  await page.evaluate((label) => {
    const element = [...document.querySelectorAll('button,a')].find(
      (e) => e.textContent.trim() === label,
    );
    if (!element) throw new Error(`Botão ausente: ${label}`);
    element.click();
  }, text);
}
async function waitText(text) {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    {},
    text,
  );
}
try {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3100/', { waitUntil: 'networkidle0' });
  await waitText('Fazer uma reserva');
  await page.$eval('#date', (input) => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    set.call(input, '2026-12-12');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Continuar');
  await page.type('#customer-name', 'Mariana Teste');
  await page.type('#whatsapp', '47999990000');
  await click('Confirmar reserva');
  await waitText('Reserva confirmada!');
  await page.click('button[aria-label^="Notificações:"]');
  await waitText('Suas notificações');
  await waitText(message.message);
  assert.equal(
    await page.evaluate(() =>
      document.body.innerText.includes('Ativar no celular'),
    ),
    false,
  );
  await page.screenshot({
    path: new URL('cliente-notificacoes.png', output).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
    fullPage: true,
  });
  console.log('PASS: reserva de cliente e sino, viewport celular.');
  await page.goto('http://localhost:3100/entrar', {
    waitUntil: 'networkidle0',
  });
  await page.type('#username', 'stafftest');
  await page.type('#password', 'somente-teste-local');
  await click('Entrar no painel');
  await waitText('Reservas de hoje');
  await page.click('button[aria-label^="Notificações:"]');
  await waitText('Avisos no celular da equipe');
  await page.keyboard.press('Escape');
  await page.waitForSelector('input[aria-label="Mesa de Mariana Teste"]');
  await page.type('input[aria-label="Mesa de Mariana Teste"]', '12 + 13');
  await page.click('button[aria-label="Salvar mesa de Mariana Teste"]');
  await waitText('Mesa salva.');
  assert.ok(savedTable);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: new URL('cards-mobile.png', output).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
    fullPage: true,
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await waitText('Confirmar chegada');
  await waitText('No show');
  await page.screenshot({
    path: new URL('painel-mesa.png', output).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  });
  console.log('PASS: login simulado e mesa no painel.');
  await page.goto('http://localhost:3100/painel/reservas', {
    waitUntil: 'networkidle0',
  });
  await click('Cancelar');
  await waitText('Cancelar reserva de Mariana Teste?');
  assert.equal(deleted, false);
  await click('Confirmar cancelamento');
  assert.equal(deleted, false);
  await page.select('#outcome-reason', 'unexpected_event');
  await click('Confirmar cancelamento');
  await waitText('motivo registrado no relatório.');
  assert.equal(deleted, true);
  assert.equal(cancellationReasonSeen, 'unexpected_event');
  console.log('PASS: motivo obrigatório no cancelamento e lista atualizada.');
  await page.goto('http://localhost:3100/painel/fila', {
    waitUntil: 'networkidle0',
  });
  await waitText('Cliente da Fila');
  await waitText('Confirmar chegada');
  await waitText('Cliente saiu da fila');
  await waitText('No show');
  await click('Cliente saiu da fila');
  await waitText('Retirar Cliente da Fila da fila?');
  await page.select('#outcome-reason', 'customer_gave_up');
  await click('Confirmar saída');
  await waitText('Motivo registrado no relatório.');
  assert.equal(queueOutcome, 'removed');
  console.log('PASS: fila registra chegada, saída e no show com motivo.');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:3100/painel/relatorios', {
    waitUntil: 'networkidle0',
  });
  await waitText('Movimento diário');
  await waitText('Clientes frequentes');
  await waitText('Cliente Cancelado');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: new URL('relatorios-mobile.png', output).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
    fullPage: true,
  });
  console.log('PASS: relatórios administrativos responsivos.');
  await page.goto('http://localhost:3100/painel/mensagens', {
    waitUntil: 'networkidle0',
  });
  await waitText('Modelos por ação');
  await click('Conferir mensagem');
  await waitText('Abrir WhatsApp');
  assert.ok(await page.$('[aria-label="Prévia da mensagem"]'));
  await page.screenshot({
    path: new URL('mensagem-revisao.png', output).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 360, height: 800 });
  await page.goto('http://localhost:3100/painel/usuarios', {
    waitUntil: 'networkidle0',
  });
  await waitText('Usuários da equipe');
  await click('Novo usuário');
  await page.type('#account-name', 'Teste Novo');
  await page.type('#account-username', 'testenovo');
  await page.type('#account-password', 'teste-senha-123');
  await page.type('#account-confirm', 'outra-senha-123');
  await click('Criar acesso');
  await waitText('As senhas precisam ser iguais.');
  await page.keyboard.press('Escape');
  await click('Editar usuário');
  await page.waitForSelector('#account-name');
  await page.$eval('#account-name', (input) => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    set.call(input, 'Nome Alterado');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Salvar alterações');
  await waitText('Acesso salvo com sucesso.');
  assert.ok(editedUser);
  testRole = 'staff';
  await page.goto('http://localhost:3100/painel/configuracoes', {
    waitUntil: 'networkidle0',
  });
  await waitText('Minha conta');
  assert.equal(await page.$('#account-role'), null);
  assert.equal(await page.$('#capacity'), null);
  const menu = await page.$$eval(
    'nav[aria-label="Navegação do painel"] a',
    (links) => links.map((a) => a.textContent.trim()),
  );
  assert.deepEqual(menu, ['Painel geral', 'Reservas', 'Fila de espera']);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: new URL('minha-conta-mobile.png', output).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
    fullPage: true,
  });
  await page.$eval('#account-name', (input) => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    set.call(input, 'Meu Novo Nome');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Salvar alterações');
  await waitText('Sua conta foi atualizada.');
  assert.equal(profile.displayName, 'Meu Novo Nome');
  await page.goto('http://localhost:3100/painel/usuarios', {
    waitUntil: 'networkidle0',
  });
  await waitText('Área exclusiva do administrador.');
  console.log(
    'PASS: menus por cargo, bloqueio de acesso direto, edição própria/admin e confirmação de senha, sem rolagem lateral.',
  );
  assert.deepEqual(failures, []);
  console.log(
    'PASS: revisão de mensagem e zero erros de interface. Nenhum envio ou acesso real ao Firebase.',
  );
} catch (error) {
  console.log(await page.evaluate(() => document.body.innerText));
  console.log(failures);
  throw error;
} finally {
  await browser.close();
}
