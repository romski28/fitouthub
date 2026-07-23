// Mimo Service Worker
// Handles: offline caching, push notifications, install lifecycle
const CACHE_NAME = "mimo-v2";
const RUNTIME_CACHE = "mimo-runtime-v2";

// ── Assets to pre-cache on install ──────────────────────────────
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/assets/mark-coral-512.png",
];

// ── Install ─────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing Mimo SW v2");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate — clean old caches ─────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating Mimo SW v2");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch — network-first for navigation, cache-first for assets ─
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // API calls → network only (don't cache API responses)
  if (url.pathname.startsWith("/api/") || url.hostname.includes("render.com")) {
    return; // let browser handle normally
  }

  // Navigation requests → network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a clone of the page
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (js, css, images, fonts) → cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
        return cached || fetched;
      })
    );
  }
});

// ── Push Notifications ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  console.log("[SW] Push received:", event);

  if (!event.data) {
    console.log("[SW] Push with no data — showing generic notification");
    event.waitUntil(
      self.registration.showNotification("Mimo", {
        body: "You have a new update on your project.",
        icon: "/assets/mark-coral-512.png",
        badge: "/assets/mark-coral-512.png",
        tag: "mimo-generic",
        vibrate: [200, 100, 200],
        data: { url: "/" },
      })
    );
    return;
  }

  try {
    const payload = event.data.json();
    const { title, body, icon, tag, url, actions } = payload;

    event.waitUntil(
      self.registration.showNotification(title || "Mimo", {
        body: body || "",
        icon: icon || "/assets/mark-coral-512.png",
        badge: "/assets/mark-coral-512.png",
        tag: tag || "mimo-default",
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { url: url || "/" },
        actions: actions || [],
      })
    );
  } catch {
    // Plain text push
    event.waitUntil(
      self.registration.showNotification("Mimo", {
        body: event.data.text(),
        icon: "/assets/mark-coral-512.png",
        badge: "/assets/mark-coral-512.png",
        vibrate: [200, 100, 200],
        data: { url: "/" },
      })
    );
  }
});

// ── Notification click → open/focus the right page ──────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a window is already open, focus it and navigate
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.postMessage({ type: "NAVIGATE", url });
            return;
          }
        }
        // Otherwise open a new window
        return clients.openWindow(url);
      })
  );
});

// ── Listen for messages from the page ───────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
