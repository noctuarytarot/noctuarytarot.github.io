// Noctuary Tarot — Service Worker
// Zvyš toto číslo při každé větší aktualizaci webu, aby si prohlížeče
// stáhly novou verzi a zahodily starou cache.
const CACHE_VERSION = 'v4';
const CACHE_NAME = 'noctuary-tarot-' + CACHE_VERSION;

// Statické soubory, které má smysl mít offline hned od instalace.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './favicon-16.png',
  './favicon-32.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key.startsWith('noctuary-tarot-') && key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Jen GET požadavky a jen náš vlastní origin (Firebase, fonty apod. necháváme jít normálně na síť).
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // HTML stránku (hlavní dokument) preferuj vždy čerstvou ze sítě,
  // ať se karta dne a texty aktualizují — offline fallback jde z cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, resClone); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Ostatní statické soubory (ikony, manifest...) — cache first, síť jako fallback.
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, resClone); });
        return res;
      }).catch(function () {
        // offline a nic v cache — necháme selhat potichu
      });
    })
  );
});
