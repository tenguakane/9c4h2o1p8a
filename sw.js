/* One Piece Wiki — кеш для повторных заходов и работы без сети.
   Положи рядом с index.html (корень сайта). Пуши живут отдельно, в firebase-messaging-sw.js. */
const PAGE = 'wk-page-v2', IMG = 'wk-img-v1', STATIC = 'wk-static-v1';
const KEEP = [PAGE, IMG, STATIC];
const IMG_LIMIT = 900;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.indexOf('wk-') === 0 && KEEP.indexOf(n) < 0).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trim(cache, limit) {
  const keys = await cache.keys();
  if (keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

/* страница: сначала сеть (новая версия приходит сразу; без изменений сервер отвечает 304).
   Если сеть отвечает дольше 6 секунд или не отвечает, показываем кеш, но запрос не бросаем:
   когда свежая версия догрузится, она ляжет в кеш и страница получит сообщение wk-update. */
async function page(req, evt) {
  const cache = await caches.open(PAGE);
  const old = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || (await cache.match('index.html'));
  const oldTag = old ? (old.headers.get('etag') || old.headers.get('last-modified') || old.headers.get('content-length') || '') : '';
  const net = fetch(req).then(async (res) => {
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  });
  const first = await Promise.race([
    net.then((r) => ({ r }), () => ({ r: null })),
    new Promise((ok) => setTimeout(() => ok({ late: true }), 6000))
  ]);
  if (first.r) return first.r;
  if (!old) return net;
  const tail = net.then(async (res) => {
    if (!res || !res.ok) return;
    const tag = res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length') || '';
    if (tag && tag === oldTag) return;
    const list = await self.clients.matchAll({ type: 'window' });
    list.forEach((c) => c.postMessage({ type: 'wk-update' }));
  }).catch(() => {});
  if (evt && evt.waitUntil) evt.waitUntil(tail);
  return old;
}

/* картинки: из кеша сразу, если нет — из сети и в кеш */
async function image(req) {
  const cache = await caches.open(IMG);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(cache, IMG_LIMIT); }
  return res;
}

/* остальное своё (манифест, иконки): из кеша и тихо обновить */
async function stale(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'i.pinimg.com') { e.respondWith(image(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/wk-push/') >= 0 || url.pathname.indexOf('firebase-messaging-sw') >= 0) return;
  if (req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/')) { e.respondWith(page(req, e)); return; }
  if (/\.(?:webmanifest|png|jpe?g|webp|svg|ico|woff2?|css|js)$/.test(url.pathname)) { e.respondWith(stale(req)); return; }
});
