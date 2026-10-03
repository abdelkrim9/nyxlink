// Cache de l'app : elle s'ouvre hors ligne. Les appels aux API (Claude, Gemini) ne passent
// jamais par le cache. Changer VERSION à chaque livraison force la mise à jour.
const VERSION = 'nyxlink-0.1.0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './src/app.js', './src/agent.js', './src/persona.js',
  './src/voice.js', './src/nyx-body.js', './src/store.js', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord pour l'app (toujours la dernière version en ligne), cache en secours hors ligne.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copie = r.clone();
    caches.open(VERSION).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request)));
});
