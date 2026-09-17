const CACHE = 'skyline-signal-1789682752199';
const APP_SHELL = [
  '/', '/manifest.json',
  '/scenery/airport.jpg', '/scenery/crosswind-coast.jpg', '/scenery/peak-rush-hour.jpg', '/scenery/superstorm-radar.jpg',
  '/icons/skyline-180.png', '/icons/skyline-192.png', '/icons/skyline-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// A running game chooses when a new release takes control. This avoids losing an
// active approach because a background PWA update happens mid-session.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      if (new URL(event.request.url).origin === self.location.origin) {
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match('/')))
  );
});
