/* מעבדת EV – Service Worker. עבודה מלאה בלי רשת. גרסה d9c28a344bdf */
'use strict';
const CACHE = 'ev-lab-app-d9c28a344bdf';
const ASSETS = ["./","app.css","app.js","data/m-alphaGT.json","data/m-g2.json","data/m-g30.json","data/m-hunterX2.json","data/m-korshidi.json","data/m-light2.json","data/m-mateX.json","data/m-onebikeX4.json","data/m-oxo.json","data/m-starkMach5.json","data/m-thunder3.json","data/m-xiaomi4pro.json","icons/apple-180.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","icons/maskable.svg","index.html","manifest.webmanifest","privacy.html","pro.js","terms.html","vendor/three.min.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ev-lab-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url.pathname.endsWith('.html') ? req : './', { ignoreSearch: true }).then(r => r || fetch(req)).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skipWaiting') self.skipWaiting(); });
