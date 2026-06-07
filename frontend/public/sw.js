/* Wroket PWA shell — cache static assets; network-first navigation with offline fallback. */

const CACHE_VERSION = "wroket-shell-v2";
const PUSH_ICON = "/wroket-notification-icon.png";
const PRECACHE_URLS = ["/offline.html", PUSH_ICON, "/wroket-logo.png"];

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

function resolveAbsoluteUrl(url) {
  if (!url) return `${self.location.origin}/notifications`;
  return url.startsWith("http") ? url : `${self.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function openUrl(url) {
  const absolute = resolveAbsoluteUrl(url);
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
    for (const client of clientList) {
      if (!client.url.startsWith(self.location.origin) || !("focus" in client)) continue;
      try {
        if ("navigate" in client && typeof client.navigate === "function") {
          await client.navigate(absolute);
          return client.focus();
        }
      } catch {
        /* navigate can fail on some Windows builds — try focus + openWindow */
      }
      try {
        await client.focus();
        return client;
      } catch {
        /* try next client */
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(absolute);
    }
    return undefined;
  });
}

async function handleAssignmentAction(action, data) {
  const todoId = data?.todoId;
  const apiBase = data?.apiBase;
  if (!todoId || !apiBase) return openUrl(data?.url);

  const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : null;
  if (!status) return openUrl(data?.url);

  try {
    const res = await fetch(`${apiBase}/todos/${encodeURIComponent(todoId)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentStatus: status }),
    });
    if (res.status === 401) {
      const redirect = encodeURIComponent(data?.url || "/todos");
      return openUrl(`${self.location.origin}/login?redirect=${redirect}`);
    }
    if (!res.ok) return openUrl(data?.url);
    return undefined;
  } catch {
    return openUrl(data?.url);
  }
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
  const actions = Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [];

  const options = {
    body,
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    tag,
    data: {
      url,
      todoId: payload.todoId,
      apiBase: payload.apiBase,
    },
  };
  if (actions.length > 0) options.actions = actions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  if (action === "accept" || action === "decline") {
    event.waitUntil(handleAssignmentAction(action, data));
    return;
  }

  event.waitUntil(openUrl(data.url || "/notifications"));
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
