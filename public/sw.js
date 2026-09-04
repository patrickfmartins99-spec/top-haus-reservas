self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// No offline cache: never cache customer details or reservation availability.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Use a safe generic notification. */ }
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Top Haus Reservas', { body: data.body || 'Há uma atualização no painel da equipe.', icon: '/icon', badge: '/icon', tag: data.tag, data: { url: data.url || '/painel' } });
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'reservation-notification' });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/painel', self.location.origin);
  if (url.origin !== self.location.origin || !/^\/painel(?:\/|$)/.test(url.pathname)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) { await client.navigate(url.href); await client.focus(); return; }
    }
    await self.clients.openWindow(url.href);
  })());
});

