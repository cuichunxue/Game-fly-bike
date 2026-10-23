/* Sky Pedal — offline cache. Bump VERSION whenever game files change. */
const VERSION = 'sky-pedal-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/favicon.svg',
  'js/vendor/three.min.js', 'js/vendor/three-extras.js', 'js/textures.js', 'js/models.js', 'js/audio.js', 'js/world.js', 'js/fx.js', 'js/game.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// network first for our own files (so updates show up), cache as the fallback when offline
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== location.origin){ e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return res; }).catch(() => r))); return; }
  e.respondWith(fetch(e.request).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request)));
});
