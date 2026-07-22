/* GRIDIRON DYNASTY — service worker (network-first)
 * Bump CACHE_NAME on every release so deploys reach devices. Network-first means
 * the newest deploy always wins when online; cache is a fallback for offline.
 */
var CACHE_NAME = 'gridiron-dynasty-v29-career-longevity';

var CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/data/teams.js',
  './js/data/teams-fbs.js',
  './js/data/lower-division-tools.js',
  './js/data/teams-fcs.js',
  './js/data/teams-d2.js',
  './js/data/teams-d3.js',
  './js/data/lower-divisions.js',
  './js/data/coaches.js',
  './js/data/names.js',
  './js/registry.js',
  './js/difficulty.js',
  './js/crests.js',
  './js/saves.js',
  './js/engine.js',
  './js/football.js',
  './js/story.js',
  './js/world.js',
  './js/tactics.js',
  './js/staff.js',
  './js/scandal.js',
  './js/cases.js',
  './js/program.js',
  './js/career.js',
  './js/season.js',
  './js/sim.js',
  './js/pwa.js',
  './js/audio.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './images/coach-portraits-v1.png'
  ,'./images/coach-active-a.jpg'
  ,'./images/coach-active-b.jpg'
  ,'./images/coach-lance.jpg'
  ,'./images/coach-legends.jpg'
  ,'./images/coaches/joepa.jpg'
];

self.addEventListener('install', function (e) {
  // Activate releases immediately. Existing clients listen for
  // controllerchange and reload into the newly cached version.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) {
    return Promise.all(CORE.map(function (u) {
      return c.add(u).catch(function () {}); // tolerate missing optional assets
    }));
  }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
