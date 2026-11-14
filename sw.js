/* PDF Loves You — service worker
 *
 * Strategy:
 *   - app shell (HTML, CSS, JS, font, icons) is precached on install
 *   - navigations are network-first, falling back to the cached shell offline
 *   - everything else is stale-while-revalidate, so updates arrive on the
 *     next visit without a version bump
 *
 * All URLs are resolved against the registration scope so the same file works
 * at a domain root (Firebase) and under a subpath (GitHub Pages).
 */

const VERSION = "2";
const CACHE = "pdlovesyou-v" + VERSION;

const SCOPE = self.registration.scope;
const url = (p) => new URL(p, SCOPE).href;

const PRECACHE = [
  "./",
  "manifest.webmanifest",
  "css/styles.css",
  "js/helpers.js",
  "js/tools/organize.js",
  "js/tools/convert.js",
  "js/tools/edit.js",
  "js/tools/security.js",
  "js/app.js",
  "assets/inter.woff2",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  // Vendor libraries are loaded up-front by index.html, so offline processing
  // only works if they are precached too. Cmaps load lazily and are cached on
  // first use by the runtime handler.
  "vendor/pdf-lib.min.js",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.blob.js",
  "vendor/jszip.min.js",
  "vendor/docx.iife.js",
  "vendor/xlsx.full.min.js",
  "vendor/pptxgen.bundle.js",
].map(url);

// "/index.html" redirects to "./" under cleanUrls, so the shell key is the scope root.
const SHELL = url("./");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Individual failures must not abort the whole install.
      await Promise.all(
        PRECACHE.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("pdlovesyou-") && k !== CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const cacheable = (res) =>
  res && res.status === 200 && (res.type === "basic" || res.type === "default");

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;
  if (req.headers.has("range")) return; // let the browser stream these itself

  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname === new URL("sw.js", SCOPE).pathname) return;

  // Navigations: fresh HTML when online, cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (cacheable(fresh)) {
            const cache = await caches.open(CACHE);
            await cache.put(SHELL, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const shell = await cache.match(SHELL);
          return shell || Response.error();
        }
      })()
    );
    return;
  }

  // Assets: serve cached copy, refresh in the background.
  const network = fetch(req)
    .then((res) => {
      if (cacheable(res)) {
        caches.open(CACHE).then((cache) => cache.put(req, res.clone())).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  event.waitUntil(network.catch(() => {}));

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      const fresh = await network;
      return fresh || Response.error();
    })()
  );
});
