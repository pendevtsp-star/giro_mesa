const STATIC_CACHE = "giromesa-static-v3";

const STATIC_ASSETS = ["/", "/login", "/icon.png", "/images/giromesa-symbol.svg", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/app/") ||
    url.pathname === "/app" ||
    url.pathname.startsWith("/q/") ||
    url.pathname.startsWith("/m/") ||
    url.pathname === "/login"
  ) {
    // Session, tenant and public-table state must never enter shared Cache Storage.
    event.respondWith(fetch(request));
    return;
  }

  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const _cache = caches.open(STATIC_CACHE).then((c) => c.put(request, response.clone()));
        return response;
      }
      return cached || response;
    })
    .catch(() => cached || caches.match("/offline"));

  return cached || fetchPromise;
}
