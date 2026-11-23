import { createNotification, insertRequest, upsertMessage, type NewNotification, type NewRequest } from "../api/requests";
import { getDb, type MessageJob, type OutboxItem, type RequestJob } from "./db";

// Cola de envíos sin conexión. Si un mensaje o una solicitud no se pudo enviar, se guarda aquí y se
// reintenta con Background Sync (el navegador despierta al Service Worker aunque la app esté cerrada)
// o, donde no existe esa API (Safari, Firefox), al volver la conexión o al abrir la app.
export const OUTBOX_SYNC_TAG = "echo-outbox";

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener());

export function onOutboxChange(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await (await getDb()).getAll("outbox");
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function enqueue(item: OutboxItem) {
  await (await getDb()).put("outbox", item);
  emit();
  await requestSync();
}

export function enqueueMessage(job: MessageJob) {
  return enqueue({ id: job.client_id, kind: "message", createdAt: job.created_at_client, attempts: 0, payload: job });
}

export function enqueueRequest(job: RequestJob) {
  const id = String(job.request.id);
  return enqueue({ id, kind: "request", createdAt: new Date().toISOString(), attempts: 0, payload: job });
}

export function supportsBackgroundSync() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window;
}

/** Pide al navegador un evento «sync»; si no existe la API, el plan B es flushOutbox() al volver online. */
async function requestSync() {
  if (!supportsBackgroundSync()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(
      OUTBOX_SYNC_TAG,
    );
  } catch (error) {
    console.warn("[Echo] No se pudo registrar Background Sync:", error);
  }
}

let flushing: Promise<number> | null = null;

/** Envía la cola desde la página con la sesión activa. Devuelve cuántos elementos salieron. */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    const db = await getDb();
    let sent = 0;
    for (const item of await listOutbox()) {
      try {
        if (item.kind === "message") {
          await upsertMessage(item.payload);
        } else {
          await sendRequestJob(item.payload);
        }
        await db.delete("outbox", item.id);
        sent += 1;
      } catch (error) {
        await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: String((error as Error).message ?? error) });
        break; // Sin conexión: el resto espera al siguiente intento, en orden.
      }
    }
    emit();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendRequestJob(job: RequestJob) {
  await insertRequest(job.request as NewRequest);
  if (job.notification) {
    // La notificación es un efecto secundario: si falla, la solicitud ya quedó guardada.
    await createNotification(job.notification as NewNotification).catch((error) =>
      console.warn("[Echo] No se creó la notificación de la solicitud:", error),
    );
  }
}

/**
 * Con Background Sync, el Service Worker es quien vacía la cola (un solo responsable, sin envíos
 * dobles). Sin esa API, la página reintenta al volver la conexión y al abrir la app (plan B).
 */
export function retryOutbox() {
  return supportsBackgroundSync() ? requestSync() : flushOutbox().then(() => undefined);
}

export function startOutboxListeners() {
  window.addEventListener("online", () => void retryOutbox());
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "outbox-flushed") emit();
  });
  void listOutbox().then((items) => {
    if (items.length > 0) void retryOutbox();
  });
}
