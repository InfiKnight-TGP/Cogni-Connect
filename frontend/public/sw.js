/* Patient shell only. Never cache API responses, caregiver HTML, media or authentication. */
const PREFIX = 'cogni-patient-';
let activeCache;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const manifest = await fetch('/sw-assets.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw Error('Offline manifest unavailable'); return response.json(); });
    activeCache = PREFIX + manifest.version;
    const cache = await caches.open(activeCache);
    await cache.addAll([...manifest.assets, '/play', '/support']);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX)).sort();
    activeCache ||= keys[keys.length - 1];
    await Promise.all(keys.filter(key => key !== activeCache).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); return;
  }
  if (event.request.mode === 'navigate' && ['/play', '/support'].includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(url.pathname)) || Response.error()));
  }
});
