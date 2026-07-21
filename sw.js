/* GRIDIRON DYNASTY — service worker (network-first)
 * Bump CACHE_NAME on every release so deploys reach devices. Network-first means
 * the newest deploy always wins when online; cache is a fallback for offline.
 */
var CACHE_NAME = 'gridiron-dynasty-v7';

var CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/data/teams.js',
  './js/data/teams-fbs.js',
  './js/data/coaches.js',
  './js/data/names.js',
  './js/engine.js',
  './js/staff.js',
  './js/scandal.js',
  './js/program.js',
  './js/career.js',
  './js/season.js',
  './js/sim.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) {
    return Promise.all(CORE.map(function (u) {
      return c.add(u).catch(function () {}); // tolerate missing optional assets
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin

  // Network-first: try the network, fall back to cache, cache fresh responses.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
