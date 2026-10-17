/// <reference lib="webworker" />
// Service worker: makes the site installable and usable on bad or no network.
// - Pages (/, /archive, /about, /h/...): network first, falling back to the last saved copy, else a built-in offline page.
//   On slow networks a saved copy is shown after 4 s instead of waiting.
// - Fonts, CSS, JS, icons: cache first (CSS/JS URLs carry the build ID, so new deploys get fresh files).
// - Poster images (/img/...): cache first (a Telegram file ID always points to the same image).
// - /admin: never cached, always live.

declare const __BUILD_ID__: string;
declare const __FONTS__: string[];
declare const __OFFLINE_HTML__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const V = __BUILD_ID__;
const STATIC = `arj-static-${V}`;
const PAGES = "arj-pages-v1";
const IMAGES = "arj-images-v1";

const PRECACHE = [
  `/site.css?v=${V}`,
  `/app.js?v=${V}`,
  "/favicon.svg",
  "/icons/icon-192.png",
  ...__FONTS__.map((f) => `/fonts/${f}`),
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(PRECACHE))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("arj-static-") && k !== STATIC).map((k) => caches.delete(k)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

/** Keeps a cache from growing forever (oldest entries go first). */
async function trim(name: string, max: number) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

const offlinePage = () =>
  new Response(__OFFLINE_HTML__, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });

const isSavedPage = (path: string) =>
  path === "/" || path === "/archive" || path === "/about" || path.startsWith("/h/");

async function page(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.pathname; // ignore ?source=pwa etc.
  const network = fetch(request).then(async (res) => {
    if (res.ok && isSavedPage(url.pathname)) {
      const cache = await caches.open(PAGES);
      await cache.put(key, res.clone());
      void trim(PAGES, 40);
    }
    return res;
  });
  const saved = await caches.match(key, { cacheName: PAGES });
  if (!saved) {
    try {
      return await network;
    } catch {
      return offlinePage();
    }
  }
  // Show the saved copy if the network is slow or down; otherwise the fresh page.
  const timeout = new Promise<Response>((resolve) => setTimeout(() => resolve(saved), 4000));
  return Promise.race([network.catch(() => saved), timeout]);
}

async function cacheFirst(request: Request, cacheName: string, max?: number): Promise<Response> {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone());
    if (max) void trim(cacheName, max);
  }
  return res;
}

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/admin."))
    return;

  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/img/")) {
    event.respondWith(cacheFirst(request, IMAGES, 120));
    return;
  }
  if (/^\/(fonts|icons)\//.test(url.pathname) || /\.(css|js|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
  }
});
