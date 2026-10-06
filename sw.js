// Simple offline cache. Bump CACHE to force an update when files change.
const CACHE = "gym-v43";
// Images live in a separate, unversioned cache so they survive app updates
// (bumping CACHE must not wipe already-downloaded exercise photos).
const IMG_CACHE = "gym-img";
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
  // Precache with cache:"reload" so we always pull the freshly deployed files,
  // bypassing the browser/CDN HTTP cache (which otherwise serves stale app.js).
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))
    )
  );
});

// The page asks us to activate the freshly installed version.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))
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
          caches.open(IMG_CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // App files: serve from the versioned cache (freshly precached at install,
  // so it matches the deployed release), and refresh it in the background.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fromNet = fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || fromNet;
    })
  );
});
