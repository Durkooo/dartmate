/* DartMate Web Push handler — public/push-sw.js.
 * Skopíruje sa do dist/ pri `npx expo export -p web` (expo kopíruje public/
 * do dist) a workbox ho pripojí k sw.js cez `importScripts` (workbox-config.js).
 * Zobrazí systémové upozornenie o novej správe, aj keď je appka zavretá.
 * Kliknutie otvorí konverzáciu s odosielateľom.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'DartMate', body: 'Máš novú správu.' };
  }
  const title = data.title || 'DartMate';
  const options = {
    body: data.body || 'Máš novú správu.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'dartmate-message',
    renotify: true,
    data: { url: data.url || '/messages' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/messages';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).pathname === new URL(url, self.location.origin).pathname) {
          await w.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
