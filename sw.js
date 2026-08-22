// Noctuary Tarot — Service Worker
// Zvyš toto číslo při každé větší aktualizaci webu, aby si prohlížeče
// stáhly novou verzi a zahodily starou cache.
const CACHE_VERSION = 'v604';
const CACHE_NAME = 'noctuary-tarot-' + CACHE_VERSION;

// Statické soubory, které má smysl mít offline hned od instalace.
const PRECACHE_URLS = [
  './',
  './index.html',
  './horoscope.html',
  './horoscope-en.html',
  './night-rain.html',
  './night-rain-en.html',
  './privacy.html',
  './what-is-tarot.html',
  './history-of-tarot.html',
  './how-to-read-tarot-cards.html',
  './major-arcana-explained.html',
  './tarot-and-love.html',
  './card-of-the-day-habit.html',
  './tarot-vs-oracle-cards.html',
  './four-suits-minor-arcana.html',
  './court-cards-explained.html',
  './tarot-myths-debunked.html',
  './numbers-in-tarot.html',
  './tarot-music-and-atmosphere.html',
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

  // horoscopes.json aktualizuje GitHub Actions 3x denně — na rozdíl od ikonek
  // a manifestu se tenhle soubor pořád mění, takže ho NIKDY neservírujeme
  // cache-first (jinak by prohlížeč mohl zobrazovat starý horoskop klidně
  // několik dní, dokud nepřijde nová verze service workera). Vždy nejdřív
  // síť, cache jen jako záložní offline fallback.
  if (new URL(req.url).pathname.endsWith('/horoscopes.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(function (res) {
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, resClone); });
          return res;
        })
        .catch(function () {
          return caches.match(req); // offline — vrátí poslední známou verzi, pokud nějaká je
        })
    );
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
