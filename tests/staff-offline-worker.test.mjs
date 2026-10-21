import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const workerCode = readFileSync(
  new URL('../public/sw.js', import.meta.url),
  'utf8',
);
const origin = 'https://reservas-tophaus.netlify.app';

function setupWorker() {
  const listeners = new Map();
  const stores = new Map();
  const requests = [];
  const notifications = [];
  const windowMessages = [[], []];
  let online = true;
  let serverError = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      const cacheKey = (key) =>
        new URL(typeof key === 'string' ? key : key.url, origin).href;
      return {
        async match(key) {
          return store.get(cacheKey(key))?.clone();
        },
        async put(key, response) {
          store.set(cacheKey(key), response.clone());
        },
        async keys() {
          return [...store.keys()].map((url) => ({ url }));
        },
        async delete(key) {
          return store.delete(cacheKey(key));
        },
      };
    },
    async match(key, { cacheName }) {
      return (await this.open(cacheName)).match(key);
    },
  };
  async function fetchMock(input) {
    const url = new URL(typeof input === 'string' ? input : input.url, origin);
    requests.push(url.pathname);
    if (!online) throw new Error('offline');
    if (serverError && url.pathname.startsWith('/painel'))
      return new Response('temporarily unavailable', { status: 503 });
    if (url.pathname.startsWith('/_next/static/'))
      return new Response('asset', { status: 200 });
    if (url.pathname.startsWith('/api/'))
      return Response.json({ customerName: 'never-cache' });
    return new Response(
      '<html><script src="/_next/static/chunks/staff.js"></script></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    );
  }
  runInNewContext(workerCode, {
    self: {
      location: { origin },
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      skipWaiting() {},
      registration: {
        async showNotification(title, options) {
          notifications.push({ title, options });
        },
      },
      clients: {
        claim() {},
        async matchAll() {
          return windowMessages.map((messages) => ({
            postMessage(message) {
              messages.push(message);
            },
          }));
        },
      },
    },
    caches,
    fetch: fetchMock,
    URL,
    Set,
  });
  async function dispatchFetch(path, mode = 'navigate') {
    let responsePromise;
    const pending = [];
    listeners.get('fetch')({
      request: { url: `${origin}${path}`, method: 'GET', mode },
      respondWith(value) {
        responsePromise = Promise.resolve(value);
      },
      waitUntil(value) {
        pending.push(Promise.resolve(value));
      },
    });
    const response = responsePromise
      ? await Promise.resolve(responsePromise)
      : null;
    await Promise.all(pending);
    return response;
  }
  async function prepare() {
    const pending = [];
    listeners.get('message')({
      data: { type: 'prepare-staff-offline' },
      waitUntil(value) {
        pending.push(Promise.resolve(value));
      },
    });
    await Promise.all(pending);
  }
  return {
    caches,
    dispatchFetch,
    prepare,
    requests,
    notifications,
    windowMessages,
    setOpenWindows(count) {
      windowMessages.length = 0;
      for (let index = 0; index < count; index += 1) windowMessages.push([]);
    },
    async dispatchPush(payload) {
      const pending = [];
      listeners.get('push')({
        data: { json: () => payload },
        waitUntil(value) {
          pending.push(Promise.resolve(value));
        },
      });
      await Promise.all(pending);
    },
    setOnline(value) {
      online = value;
    },
    setServerError(value) {
      serverError = value;
    },
  };
}

test('prepares only staff shells and immutable assets, once per device', async () => {
  const worker = setupWorker();
  await worker.prepare();
  assert.deepEqual(
    worker.requests.filter((path) => path.startsWith('/api/')),
    [],
  );
  for (const path of [
    '/entrar',
    '/painel',
    '/painel/reservas',
    '/painel/fila',
  ]) {
    assert.ok(
      await worker.caches.match(path, { cacheName: 'tophaus-staff-shell-v1' }),
    );
  }
  assert.ok(
    await worker.caches.match('/_next/static/chunks/staff.js', {
      cacheName: 'tophaus-staff-assets-v1',
    }),
  );
  assert.ok(
    await worker.caches.match('/logo-tophaus.jpg', {
      cacheName: 'tophaus-staff-assets-v1',
    }),
  );
  const count = worker.requests.length;
  await worker.prepare();
  assert.equal(worker.requests.length, count);
});

test('opens prepared staff pages offline and never caches API or RSC data', async () => {
  const worker = setupWorker();
  await worker.prepare();
  worker.setOnline(false);
  assert.equal((await worker.dispatchFetch('/painel/fila')).status, 200);
  assert.equal(
    (await worker.dispatchFetch('/_next/static/chunks/staff.js', 'cors'))
      .status,
    200,
  );
  assert.equal(
    (await worker.dispatchFetch('/logo-tophaus.jpg', 'no-cors')).status,
    200,
  );
  assert.equal(await worker.dispatchFetch('/api/fila?ativas=1', 'cors'), null);
  assert.equal(
    await worker.dispatchFetch('/painel/fila?_rsc=abc', 'cors'),
    null,
  );
  assert.equal(await worker.dispatchFetch('/minha-reserva', 'navigate'), null);
  assert.equal(
    await worker.caches.match('/api/fila?ativas=1', {
      cacheName: 'tophaus-staff-shell-v1',
    }),
    undefined,
  );
});

test('uses the prepared shell if hosting temporarily returns a server error', async () => {
  const worker = setupWorker();
  await worker.prepare();
  worker.setServerError(true);
  assert.equal((await worker.dispatchFetch('/painel')).status, 200);
});

test('push shows the action and alerts every open staff window', async () => {
  const worker = setupWorker();
  await worker.dispatchPush({
    title: 'Nova reserva pelo site',
    body: 'Mariana · 4 pessoas · rodízio em 12/12 às 19:00.',
    url: '/painel/reservas',
    tag: 'event-1',
  });
  assert.equal(worker.notifications[0].title, 'Nova reserva pelo site');
  assert.match(worker.notifications[0].options.body, /Mariana/);
  assert.deepEqual(
    worker.windowMessages.map((messages) => messages.length),
    [1, 1],
  );
});

test('push still displays the message when no staff window is open', async () => {
  const worker = setupWorker();
  worker.setOpenWindows(0);
  await worker.dispatchPush({
    title: 'Reserva alterada pelo cliente',
    body: 'Confira os dados atualizados no painel.',
    url: '/painel/reservas',
  });
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].title, 'Reserva alterada pelo cliente');
  assert.equal(worker.windowMessages.length, 0);
});
