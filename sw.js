/* sw.js – Service Worker für NjaKër */
const CACHE = 'njaker-v2';
const SHELL = [
  './', './index.html', './config.js',
  './ics.js', './todos.js', './termine.js', './contracts.js', './dashboard.js',
  './auth.js', './household.js', './home.js', './app.js',
  './css/vars.css', './css/app.css',
  './manifest.json', './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase + Google Fonts + CDN: immer live, kein Cache
  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('supabase.io') ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Shell: Cache-First
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }))
  );
});
