import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3102';
const server = process.env.TEST_BASE_URL
  ? null
  : spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)),
        'start', '--hostname', '127.0.0.1', '--port', '3102',
      ],
      { stdio: 'ignore' },
    );
if (server) {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      ready = (await fetch(`${base}/entrar`)).ok;
      if (ready) break;
    } catch { /* Wait for the local test server. */ }
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
    return (await Promise.all(
      ['/entrar', '/painel', '/painel/reservas', '/painel/fila']
        .map((path) => cache.match(path)),
    )).every(Boolean);
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
  console.log('PASS: entrada abre sem rede, três telas estão preparadas e API não é armazenada.');
} finally {
  await browser.close();
  server?.kill();
}
