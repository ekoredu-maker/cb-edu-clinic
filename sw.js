const CACHE_NAME = "jc-edu-clinic-v13.0.1-admin-report-hotfix";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css",
  "./assets/js/app.js",
  "./assets/js/bootstrap.js",
  "./assets/js/core/store.js",
  "./assets/js/data/persistence.js",
  "./assets/js/domain/statistics.js",
  "./assets/js/domain/verification.js",
  "./assets/js/hybrid/python-bridge.js",
  "./assets/js/hybrid/regression.js",
  "./assets/js/hybrid/engine-source.js",
  "./assets/js/hybrid/authoritative-engine.js",
  "./assets/js/hybrid/dual-write.js",
  "./assets/js/hybrid/storage-migration.js",
  "./assets/js/hybrid/read-source.js",
  "./assets/js/hybrid/document-export.js",
  "./assets/js/hybrid/statistics-report-export.js",
  "./icons/favicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match("./index.html"));
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
