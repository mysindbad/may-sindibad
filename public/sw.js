// Conservative service worker: cache only immutable public shell assets.
// Dynamic pages, API routes, authentication and payments are never cached.
const CACHE_NAME = "sindbad-shell-v4";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icons/my-sindbad-192.png", "/icons/my-sindbad-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !SHELL_ASSETS.includes(url.pathname)) return;
  // Scoped to this version's cache specifically, not a global caches.match()
  // across every cache this origin has ever created - a leftover cache from
  // a previous version (e.g. mid-upgrade, or if activate's cleanup hasn't
  // run yet) must never be able to answer with stale bytes.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request)).then((cached) => cached ?? fetch(event.request)),
  );
});
