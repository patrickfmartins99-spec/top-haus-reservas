const STAFF_SHELL_CACHE = 'tophaus-staff-shell-v1';
const STAFF_ASSET_CACHE = 'tophaus-staff-assets-v1';
const STAFF_ROUTES = new Set([
  '/entrar',
  '/painel',
  '/painel/reservas',
  '/painel/fila',
]);
const MAX_ASSETS = 160;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

// Only cache the public Next.js shell and immutable assets. Customer records,
// API responses, Firebase traffic and RSC payloads are never stored here.
async function saveStaffPage(path, response) {
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('text/html') ||
    (response.url && new URL(response.url).origin !== self.location.origin)
  )
    return;
  const cache = await caches.open(STAFF_SHELL_CACHE);
  await cache.put(path, response.clone());
}

async function saveAsset(request, response) {
  if (!response.ok) return;
  const cache = await caches.open(STAFF_ASSET_CACHE);
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) await cache.delete(keys[0]);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    request.mode === 'navigate' &&
    STAFF_ROUTES.has(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.status >= 500) {
            const cached = await caches.match(url.pathname, {
              cacheName: STAFF_SHELL_CACHE,
            });
            if (cached) return cached;
          }
          event.waitUntil(saveStaffPage(url.pathname, response));
          return response;
        } catch (error) {
          const cached = await caches.match(url.pathname, {
            cacheName: STAFF_SHELL_CACHE,
          });
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/logo-tophaus.jpg'
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, {
          cacheName: STAFF_ASSET_CACHE,
        });
        if (cached) return cached;
        const response = await fetch(request);
        event.waitUntil(saveAsset(request, response));
        return response;
      })(),
    );
  }
});

// Called only after the staff account has been checked. This warms the three
// consultation pages once on this device, without touching Firestore.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'prepare-staff-offline') return;
  event.waitUntil(
    (async () => {
      const pageCache = await caches.open(STAFF_SHELL_CACHE);
      const logoCache = await caches.open(STAFF_ASSET_CACHE);
      if (!(await logoCache.match('/logo-tophaus.jpg'))) {
        try {
          await saveAsset(
            '/logo-tophaus.jpg',
            await fetch('/logo-tophaus.jpg'),
          );
        } catch {
          // A logo may still be cached by a later online page load.
        }
      }
      for (const path of STAFF_ROUTES) {
        if (await pageCache.match(path)) continue;
        try {
          const response = await fetch(path, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          if (!response.ok) continue;
          await saveStaffPage(path, response);
          const html = await response.text();
          const assetPaths = new Set(
            [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)[^"]*"/g)]
              .map((match) => match[1].replaceAll('&amp;', '&')),
          );
          const assetCache = await caches.open(STAFF_ASSET_CACHE);
          for (const assetPath of assetPaths) {
            if (await assetCache.match(assetPath)) continue;
            try {
              const asset = await fetch(assetPath);
              await saveAsset(assetPath, asset);
            } catch {
              // A normal online navigation can finish caching missed assets.
            }
          }
        } catch {
          // Contingency preparation is best-effort and never blocks the UI.
        }
      }
    })(),
  );
});
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* Use a safe generic notification. */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(
        data.title || 'Atualização no Top Haus',
        {
          body: data.body || 'Abra o painel para conferir o que mudou.',
          icon: '/icon',
          badge: '/icon',
          tag: data.tag,
          renotify: true,
          data: { url: data.url || '/painel' },
        },
      );
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows)
        client.postMessage({ type: 'reservation-notification' });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || '/painel',
    self.location.origin,
  );
  if (
    url.origin !== self.location.origin ||
    !/^\/painel(?:\/|$)/.test(url.pathname)
  )
    return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (
          new URL(client.url).origin === self.location.origin &&
          'focus' in client
        ) {
          await client.navigate(url.href);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
