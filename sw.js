const CACHE_NAME = "jc-edu-clinic-v10.6-cache";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/favicon.png", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(()=>{});
    return resp;
  }).catch(() => caches.match("./index.html"))));
});
self.addEventListener("message", event => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
