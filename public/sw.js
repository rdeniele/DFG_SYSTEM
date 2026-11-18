/* Daryl Fitness Gym service worker.
 * - Pages: network first, fall back to the last saved copy, then to /offline.
 * - Next.js static files (hashed, never change): cache first.
 * - Supabase / API / page data requests: never cached (always live).
 * The member's last status is kept by the page itself (localStorage), so an offline
 * member still sees it with a "Last updated" time.
 * Bump VERSION to force phones to drop old caches.
 */
const VERSION = "v2"; // v2: new logo icons
const PAGES = `dfg-pages-${VERSION}`;
const STATIC = `dfg-static-${VERSION}`;
const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/favicon-48.png",
];
const MAX_STATIC_ENTRIES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase etc: straight to network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/downloads/")) return;

  // Full page loads
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req, url));
    return;
  }

  // Next.js page-data / prefetch requests: always live
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  // Hashed build files, fonts, icons
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirstPage(req, url) {
  const cache = await caches.open(PAGES);
  const key = url.pathname; // ignore ?m=... etc
  try {
    const res = await fetch(req);
    // Only keep real pages (not redirects or errors).
    if (res.ok && res.type === "basic" && !res.redirected) {
      cache.put(key, res.clone());
    }
    return res;
  } catch {
    // Opening the app offline (start page "/login" or "/"): logged-in users are normally
    // redirected to their dashboard, so show the saved dashboard instead.
    const home = key === "/" || key === "/login" ? (await cache.match("/me")) || (await cache.match("/admin")) : null;
    return (
      home ||
      (await cache.match(key)) ||
      (await cache.match("/offline")) ||
      new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    cache.put(req, res.clone());
    trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) await cache.delete(keys[i]);
}
