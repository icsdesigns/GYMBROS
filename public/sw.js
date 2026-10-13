/* Service worker de GymBros: notificaciones push + modo offline. */

const CACHE = "gymbros-v2";
const STATIC = "gymbros-static-v2";
const DATA = "gymbros-data-v1";
const OFFLINE_URL = "/panel";

// Precarga del núcleo de la app para que arranque sin conexión
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE).then((c) =>
        c.addAll(["/", "/panel", "/entrenamiento", "/comunidad", "/manifest.json"]).catch(() => undefined),
      ),
      // La alarma del temporizador debe estar lista aunque no haya red
      caches.open(STATIC).then((c) => c.add("/timer-alarm.wav").catch(() => undefined)),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE, STATIC, DATA].includes(k))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static") || /\.(png|jpg|jpeg|svg|webp|ico|woff2?|wav|mp3|m4a)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return; // las mutaciones (POST) las gestiona la app

  // Assets estáticos: cache-first con revalidación en segundo plano
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Consultas de datos (tRPC usa GET): network-first con caché de respaldo
  if (url.pathname.startsWith("/api/trpc")) {
    event.respondWith(
      caches.open(DATA).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(request);
          return cached || new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
        }
      }),
    );
    return;
  }

  // Navegación entre páginas: network-first con caché de respaldo
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});

// ---------- Notificaciones push ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "GymBros", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "GymBros", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      // Con etiqueta (p. ej. el aviso de entreno parado) un aviso repetido
      // sustituye al anterior en lugar de apilarse, y lo hace sin volver a sonar.
      // Los del chat (chat-<grupo>) sí vuelven a avisar con cada mensaje nuevo
      ...(data.tag ? { tag: data.tag, renotify: String(data.tag).startsWith("chat-") } : {}),
      data: { url: data.url || "/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/panel";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
