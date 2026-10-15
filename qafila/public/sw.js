// Service worker : l'interface fonctionne hors-ligne, les résultats ne sont jamais mis en cache côté navigateur.
const SHELL = 'qafila-shell-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/logo.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(url.pathname === '/' || url.searchParams.has('q') ? '/index.html' : e.request).then(hit => hit || fetch(e.request)));
});
