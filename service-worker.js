const CACHE = 'catalogo-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './assets/css/styles.css',
  './assets/js/app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE_ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Estrategia: cache-first para estáticos; network-first para JSON; cache con fallback offline para imgs
  if (req.destination === 'document' || CORE_ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).catch(() => caches.match('./offline.html'))));
    return;
  }

  if (url.pathname.endsWith('.json')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  if (req.destination === 'image') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => new Response('', { status: 404 }))));
    return;
  }

  // default
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});