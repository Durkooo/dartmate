/* DartMate Web Push handler — public/push-sw.js.
 * Skopíruje sa do dist/ pri `npx expo export -p web` (expo kopíruje public/
 * do dist) a workbox ho pripojí k sw.js cez `importScripts` (workbox-config.js).
 * Zobrazí systémové upozornenie o novej správe, aj keď je appka zavretá.
 * Kliknutie otvorí konverzáciu s odosielateľom.
 *
 * Hovory: backend posiela len { title, body, url, tag }, preto druh upozornenia
 * spoznáme z odkazu:
 *   ?autoJoin=<id>[&kind=audio]  → prichádzajúci hovor (zvoní, Prijať/Odmietnuť)
 *   ?missedCall=<id>[&kind=audio] → zmeškaný hovor (nahradí zvoniace upozornenie)
 */

const CALL_VIBRATE = [700, 300, 700, 300, 700, 300, 700, 300, 700, 300, 700];

function callInfo(url) {
  try {
    const u = new URL(url, self.location.origin);
    const ringing = u.searchParams.get('autoJoin');
    const missed = u.searchParams.get('missedCall');
    if (!ringing && !missed) return null;
    return {
      missed: !ringing,
      audio: u.searchParams.get('kind') === 'audio',
      // Jedno upozornenie na priateľa: zmeškaný hovor prepíše zvoniaci.
      tag: `dartmate-call-${u.pathname}`,
      path: u.pathname,
    };
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'DartMate', body: 'Máš novú správu.' };
  }
  const title = data.title || 'DartMate';
  const url = data.url || '/messages';
  const call = callInfo(url);
  if (call) {
    const icon = call.audio ? '📞' : '📹';
    const options = call.missed
      ? {
          body: call.audio ? 'Zmeškaný hlasový hovor' : 'Zmeškaný videohovor',
          icon: '/icons/icon-192-v2.png',
          badge: '/icons/icon-192-v2.png',
          tag: call.tag,
          renotify: false,
          data: { url: call.path },
        }
      : {
          body: call.audio ? 'Prichádzajúci hlasový hovor' : 'Prichádzajúci videohovor',
          icon: '/icons/icon-192-v2.png',
          badge: '/icons/icon-192-v2.png',
          tag: call.tag,
          renotify: true,
          // Android: ostane na obrazovke, kým naň neťukneš, a dlho vibruje ako zvonenie.
          requireInteraction: true,
          vibrate: CALL_VIBRATE,
          actions: [
            { action: 'accept', title: 'Prijať' },
            { action: 'decline', title: 'Odmietnuť' },
          ],
          data: { url },
        };
    const heading = call.missed ? `Zmeškaný hovor od ${title}` : `${icon} Volá ti ${title}`;
    event.waitUntil(self.registration.showNotification(heading, options));
    return;
  }
  const options = {
    body: data.body || 'Máš novú správu.',
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2.png',
    tag: data.tag || 'dartmate-message',
    renotify: true,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // „Odmietnuť“ len zavrie upozornenie (pozvánka v chate ostane ako zmeškaná).
  if (event.action === 'decline') return;
  const url = (event.notification.data && event.notification.data.url) || '/messages';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).pathname === new URL(url, self.location.origin).pathname) {
          if (w.url !== new URL(url, self.location.origin).href) {
            await w.navigate(new URL(url, self.location.origin).href);
          }
          await w.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
