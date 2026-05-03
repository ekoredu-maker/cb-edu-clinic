const CACHE_NAME = 'jc-edu-clinic-v10.3.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/variables.css',
  './assets/css/layout.css',
  './assets/css/components.css',
  './assets/css/print.css',
  './assets/js/app.js',
  './assets/js/core/engine.js',
  './assets/js/core/router.js',
  './assets/js/core/state.js',
  './assets/js/core/time.js',
  './assets/js/services/cache.js',
  './assets/js/services/excel.js',
  './assets/js/services/migration.js',
  './assets/js/services/print.js',
  './assets/js/services/xlsx-lite.js',
  './assets/js/domain/matching.js',
  './assets/js/domain/sessions.js',
  './assets/js/domain/statistics.js',
  './assets/js/domain/students.js',
  './assets/js/domain/supporters.js',
  './assets/js/domain/training.js',
  './assets/js/domain/validation.js',
  './assets/js/templates/forms.js',
  './assets/js/templates/reports.js',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './README.md',
  './V10.3_UPGRADE_REPORT.md',
  './samples/sample-supporters.csv',
  './samples/sample-students.csv',
  './samples/월별실적_양식견본.xlsx',
  './samples/분기별실적_양식견본.xlsx'
];


self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
