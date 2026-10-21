import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3102';
const screenshotDirectory = process.env.TEST_SCREENSHOT_DIR;
async function screenshot(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: join(screenshotDirectory, name),
    fullPage: true,
  });
}
const server = process.env.TEST_BASE_URL
  ? null
  : spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL('../node_modules/next/dist/bin/next', import.meta.url),
        ),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        '3102',
      ],
      { stdio: 'ignore' },
    );
if (server) {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      ready = (await fetch(`${base}/entrar`)).ok;
      if (ready) break;
    } catch {
      /* Wait for the local test server. */
    }
    await delay(200);
  }
  assert.ok(ready, 'Local test server did not start');
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TEST_CHROME_PATH
    ? { executablePath: process.env.TEST_CHROME_PATH }
    : {}),
});

try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(`${base}/entrar`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'prepare-staff-offline' });
  });
  await page.waitForFunction(async () => {
    const cache = await caches.open('tophaus-staff-shell-v1');
    return (
      await Promise.all(
        ['/entrar', '/painel', '/painel/reservas', '/painel/fila'].map((path) =>
          cache.match(path),
        ),
      )
    ).every(Boolean);
  });
  await context.setOffline(true);
  const response = await page.goto(`${base}/entrar`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(response?.status(), 200);
  assert.equal(response?.fromServiceWorker(), true);
  assert.match(await page.locator('body').innerText(), /Bem-vindo de volta/);
  const apiCached = await page.evaluate(async () => {
    const cache = await caches.open('tophaus-staff-shell-v1');
    return (await cache.keys()).some((request) =>
      new URL(request.url).pathname.startsWith('/api/'),
    );
  });
  assert.equal(apiCached, false);
  console.log(
    'PASS: entrada abre sem rede, três telas estão preparadas e API não é armazenada.',
  );

  const mobile = await browser.newContext({
    viewport: { width: 360, height: 800 },
    serviceWorkers: 'allow',
  });
  let apiOffline = false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const reservation = {
    id: 'staff-reservation-test',
    reservationCode: '0000121226',
    customerName: 'Mariana Teste',
    whatsapp: '47999990000',
    partySize: 4,
    service: 'rodizio',
    serviceDate: today,
    arrivalTime: '19:00',
    status: 'confirmed',
    tableLabel: 'Mesa 12',
    notes: '',
    canModify: true,
    canDelete: true,
    modifyDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    lateToleranceMinutes: 10,
    restaurantWhatsapp: '47999997777',
  };
  const queue = {
    id: 'staff-queue-test',
    customerName: 'Cliente da Fila',
    whatsapp: '47999998888',
    partySize: 3,
    status: 'called',
    enteredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    calledAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  };
  const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
    JSON.stringify({
      sub: 'staff-test',
      user_id: 'staff-test',
      email: 'staff@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'password' },
    }),
  ).toString('base64url')}.test`;
  await mobile.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
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
        });
      return reply({
        users: [
          {
            localId: 'staff-test',
            email: 'staff@example.com',
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
        project_id: 'local-test',
      });
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (apiOffline) return route.abort();
    if (url.pathname === '/api/conta')
      return reply({
        profile: {
          uid: 'staff-test',
          username: 'stafftest',
          displayName: 'Equipe Teste',
          role: 'staff',
          photo: '',
        },
      });
    if (url.pathname === '/api/status') return reply({ firebase: 'connected' });
    if (url.pathname === '/api/reservas')
      return reply({ reservations: [reservation] });
    if (url.pathname === '/api/fila') return reply({ entries: [queue] });
    if (url.pathname === '/api/configuracoes/publicas')
      return reply({ exceptions: [] });
    if (url.pathname === '/api/minha-reserva')
      return reply({
        choices: [
          {
            ...reservation,
            id: '0000121226',
            lookupId: 'lunch',
            service: 'almoco',
            arrivalTime: '11:00',
          },
          { ...reservation, id: '0000121226', lookupId: 'dinner' },
        ],
      });
    return reply({ error: 'Not mocked' }, 404);
  });
  const phone = await mobile.newPage();
  phone.on('pageerror', (error) =>
    console.error('MOBILE PAGE ERROR:', error.stack),
  );
  await phone.goto(`${base}/cliente/minha-reserva`);
  await phone.locator('#reservation-code').fill('0000121226');
  await phone.locator('#reservation-whatsapp').fill('47999990000');
  await phone.getByRole('button', { name: 'Consultar reserva' }).click();
  await phone.getByRole('heading', { name: 'Escolha a reserva' }).waitFor();
  await phone.getByRole('button', { name: /Almoço · 11:00/ }).click();
  await phone.getByRole('heading', { name: /Almoço no Top Haus/ }).waitFor();
  await screenshot(phone, 'consulta-mobile.png');

  await phone.goto(`${base}/entrar`);
  await phone.locator('#username').fill('stafftest');
  await phone.locator('#password').fill('password123');
  await phone.locator('form button[type="submit"]').click();
  await phone.getByRole('heading', { name: 'Reservas de hoje' }).waitFor();
  await phone.getByText('Mariana Teste').first().waitFor();
  await phone.waitForFunction(async () => {
    const cache = await caches.open('tophaus-staff-shell-v1');
    return Boolean(
      localStorage.getItem('tophaus.staff.cache.v1.reservations') &&
      localStorage.getItem('tophaus.staff.cache.v1.waitlist') &&
      (await cache.match('/painel')) &&
      (await cache.match('/painel/reservas')) &&
      (await cache.match('/painel/fila')),
    );
  });
  const nav = phone.getByRole('navigation', {
    name: 'Navegação principal no celular',
  });
  await nav.getByRole('link', { name: 'Reservas' }).click();
  await phone.getByRole('button', { name: /Mais filtros/ }).click();
  assert.equal(
    await phone
      .getByRole('combobox', { name: 'Filtrar por situação' })
      .isVisible(),
    true,
  );
  await screenshot(phone, 'reservas-mobile.png');
  await nav.getByRole('link', { name: 'Fila' }).click();
  await phone.getByText('Cliente da Fila').first().waitFor();
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await screenshot(phone, 'fila-mobile.png');
  apiOffline = true;
  await mobile.setOffline(true);
  await phone.reload({ waitUntil: 'domcontentloaded' });
  await phone.getByText('Modo de contingência — somente consulta').waitFor();
  assert.equal(
    await phone.getByRole('button', { name: 'Confirmar chegada' }).isDisabled(),
    true,
  );
  await screenshot(phone, 'fila-offline-mobile.png');
  await nav.getByRole('link', { name: 'Reservas' }).click();
  await phone.getByText('Modo de contingência — somente consulta').waitFor();
  await phone.getByText('Mariana Teste').first().waitFor();
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await nav.getByRole('link', { name: 'Hoje' }).click();
  await phone.getByText('Modo de contingência — somente consulta').waitFor();
  const reopened = await mobile.newPage();
  const reopenedResponse = await reopened.goto(`${base}/painel`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(reopenedResponse?.fromServiceWorker(), true);
  await reopened.getByText('Modo de contingência — somente consulta').waitFor();
  await reopened.getByText('Mariana Teste').first().waitFor();
  await reopened.close();
  apiOffline = false;
  await mobile.setOffline(false);
  await phone.getByRole('button', { name: 'Tentar novamente' }).click();
  await phone
    .getByText('Modo de contingência — somente consulta')
    .waitFor({ state: 'hidden' });
  console.log(
    'PASS: escolha de reserva, navegação 360 px e consulta offline completa com reconexão.',
  );
} finally {
  await browser.close();
  server?.kill();
}
