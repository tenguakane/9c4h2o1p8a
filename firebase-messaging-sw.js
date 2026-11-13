/* Служба уведомлений One Piece Wiki. Лежит рядом с HTML-файлом сайта. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  var n = d.notification || d.data || d;
  var title = n.title || 'Набор карточек готов';
  var body = n.body || 'Можно открыть новый набор в Колоде.';
  // Каждый пуш обязан показать уведомление (требование iOS и Chrome).
  e.waitUntil(self.registration.showNotification(title, { body: body, tag: 'wk-deck-pack' }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow(new URL('../', self.registration.scope).href);
  }));
});
