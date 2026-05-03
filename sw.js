const CACHE_NAME = "jc-edu-clinic-v11-cache";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css",
  "./assets/js/00-core.js",
  "./assets/js/01-dashboard.js",
  "./assets/js/02-supporters.js",
  "./assets/js/03-students.js",
  "./assets/js/04-matching.js",
  "./assets/js/05-training.js",
  "./assets/js/06-statistics.js",
  "./assets/js/07-validation.js",
  "./assets/js/08-forms.js",
  "./assets/js/09-admin.js",
  "./assets/js/10-ext-v99.js",
  "./assets/js/11-ext-v10.js",
  "./assets/js/12-patches.js",
  "./icons/favicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match("./index.html")))
  );
});
self.addEventListener("message", event => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
