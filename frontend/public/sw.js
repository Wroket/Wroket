/* Wroket PWA shell — cache static assets; network-first navigation with offline fallback. */

const CACHE_VERSION = "wroket-shell-v1";
const PRECACHE_URLS = ["/offline.html", "/wroket-icon-v4.png", "/wroket-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/")
    || /\.(?:png|svg|ico|webp|woff2?|css|js|json)$/i.test(pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline.html");
    if (offline) return offline;
    return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function openUrl(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
    return undefined;
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Wroket", body: event.data.text() };
  }
  const title = payload.title || "Wroket";
  const body = payload.body || "";
  const url = payload.url || "/notifications";
  const tag = payload.notifId ? `wroket-${payload.notifId}` : "wroket-push";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/wroket-icon-v4.png",
      badge: "/wroket-icon-v4.png",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  const absolute = url.startsWith("http") ? url : `${self.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
  event.waitUntil(openUrl(absolute));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(event.request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
  }
});
