/// <reference lib="webworker" />
// Service Worker de Echo. Workbox aporta las piezas (precaché, rutas, estrategias) y aquí se decide
// qué estrategia usa cada tipo de recurso, además de Background Sync y Web Push.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { openDB } from "idb";
import { config } from "./config";
import { DB_NAME, DB_VERSION, type OutboxItem, type SessionSnapshot } from "./pwa/db";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

const OUTBOX_SYNC_TAG = "echo-outbox";

// 1. App Shell: Vite genera la lista con hash de cada archivo; una versión nueva reemplaza la anterior.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 2. Navegación: la SPA usa rutas con #, así que cualquier navegación se sirve con el index.html guardado.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// 3. Datos de Supabase (catálogo, solicitudes, chat): Network First. Con red se ve lo más nuevo y se
//    guarda una copia; sin red (o si tarda más de 4 s) se responde con la última copia.
registerRoute(
  ({ url, request }) => url.origin === new URL(config.supabaseUrl).origin && url.pathname.startsWith("/rest/v1/") && request.method === "GET",
  new NetworkFirst({
    cacheName: "echo-datos",
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

// 4. Fotos de servicios y avatares: Cache First. Una foto con la misma ruta no cambia, así que se
//    sirve del caché sin esperar a la red.
registerRoute(
  ({ url }) => url.origin === new URL(config.supabaseUrl).origin && url.pathname.startsWith("/storage/v1/object/public/"),
  new CacheFirst({
    cacheName: "echo-fotos",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

// 5. Fotos de las categorías (Unsplash, las mismas de la app móvil): Cache First.
registerRoute(
  ({ url }) => url.origin === "https://images.unsplash.com",
  new CacheFirst({
    cacheName: "echo-categorias",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 30 })],
  }),
);

// Actualización controlada: la página muestra «Nueva versión» y pide activarla.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// ---------- Background Sync: envía la cola guardada sin conexión ----------

const database = () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("session")) db.createObjectStore("session", { keyPath: "id" });
    },
  });

async function rest(path: string, body: unknown, token: string, prefer: string) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
}

async function sendItem(item: OutboxItem, token: string) {
  if (item.kind === "message") {
    // Mismo upsert por client_id que la página: un reintento no duplica el mensaje.
    await rest("message?on_conflict=client_id", item.payload, token, "resolution=merge-duplicates,return=minimal");
    return;
  }
  await rest("service_request?on_conflict=id", item.payload.request, token, "resolution=ignore-duplicates,return=minimal");
  if (item.payload.notification) {
    await rest("notification", { id: crypto.randomUUID(), read: false, ...item.payload.notification }, token, "return=minimal").catch(
      () => undefined,
    );
  }
}

async function flushOutbox() {
  const db = await database();
  const session = (await db.get("session", "current")) as SessionSnapshot | undefined;
  // El Service Worker no renueva la sesión (eso rotaría el refresh token de la página). Si el token
  // venció, el sync falla y se reintenta; al abrir la app, la página envía la cola con sesión nueva.
  if (!session || session.expiresAt * 1000 < Date.now() + 30_000) throw new Error("Sesión vencida");

  const items = ((await db.getAll("outbox")) as OutboxItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of items) {
    await sendItem(item, session.accessToken);
    await db.delete("outbox", item.id);
  }
  const windows = await self.clients.matchAll({ type: "window" });
  windows.forEach((client) => client.postMessage({ type: "outbox-flushed", count: items.length }));
}

self.addEventListener("sync", ((event: Event & { tag: string; waitUntil(p: Promise<unknown>): void }) => {
  if (event.tag !== OUTBOX_SYNC_TAG) return;
  // Si la promesa falla, el navegador vuelve a intentar más tarde.
  event.waitUntil(flushOutbox());
}) as EventListener);

// ---------- Web Push ----------

type PushPayload = { title?: string; body?: string; url?: string; tag?: string; badge?: number };

function readPush(data: PushMessageData | null): PushPayload {
  if (!data) return {};
  try {
    return data.json() as PushPayload;
  } catch {
    return { body: data.text() };
  }
}

/** Rutas relativas (#/chat/…) resueltas contra el scope, para que funcionen bajo /…/app/. */
function appUrl(path: string | undefined) {
  const scope = self.registration.scope;
  try {
    const url = new URL(path ?? "", scope).href;
    return url.startsWith(scope) ? url : scope;
  } catch {
    return scope;
  }
}

self.addEventListener("push", (event) => {
  const payload = readPush(event.data);
  const nav = self.navigator as WorkerNavigator & { setAppBadge?: (n: number) => Promise<void> };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Echo", {
        body: payload.body ?? "",
        icon: new URL("icons/icon-192.png", self.registration.scope).href,
        badge: new URL("icons/badge-96.png", self.registration.scope).href,
        tag: payload.tag || "echo",
        lang: "es-MX",
        data: { url: appUrl(payload.url) },
      }),
      typeof payload.badge === "number" ? nav.setAppBadge?.(payload.badge).catch(() => undefined) : undefined,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (!app) return self.clients.openWindow(url);
      // La SPA cambia de pantalla sin recargar; focus() puede fallar sin un clic real, así que va después.
      app.postMessage({ type: "navigate", url });
      return (app as WindowClient).focus().catch(() => app);
    })(),
  );
});
