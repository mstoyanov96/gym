// Simple offline cache. Bump CACHE to force an update when files change.
const CACHE = "gym-v17";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./i18n.js",
  "./muscles.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // Wait for the user to confirm the update (via SKIP_WAITING) before activating.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// The page asks us to activate the freshly installed version.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isImage = e.request.destination === "image" ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname);

  if (isImage) {
    // Cache-first for images: instant after the first load (incl. remote photos).
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Network-first for app files: always try fresh when online, fall back to cache offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
