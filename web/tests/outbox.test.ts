import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test, vi } from "vitest";

// La cola offline guarda en IndexedDB y, al reconectar, envía en orden con la API de Supabase.
const upsertMessage = vi.fn();
const insertRequest = vi.fn();
const createNotification = vi.fn();
vi.mock("../src/api/requests", () => ({ upsertMessage, insertRequest, createNotification }));

const { enqueueMessage, enqueueRequest, flushOutbox, listOutbox } = await import("../src/pwa/outbox");

const message = (id: string, at: string) => ({ client_id: id, created_at_client: at, content: "hola", sender: "u1", request: "r1" });

describe("cola sin conexión", () => {
  beforeEach(async () => {
    for (const item of await listOutbox()) await (await import("../src/pwa/db")).getDb().then((db) => db.delete("outbox", item.id));
    vi.clearAllMocks();
  });

  test("guarda mensajes y solicitudes y los envía en orden de creación", async () => {
    await enqueueMessage(message("b", "2026-11-23T10:02:00.000Z"));
    await enqueueMessage(message("a", "2026-11-23T10:01:00.000Z"));
    expect((await listOutbox()).map((item) => item.id)).toEqual(["a", "b"]);

    upsertMessage.mockResolvedValue({});
    expect(await flushOutbox()).toBe(2);
    expect(upsertMessage.mock.calls.map(([job]) => job.client_id)).toEqual(["a", "b"]);
    expect(await listOutbox()).toEqual([]);
  });

  test("si falla la red, conserva el elemento, cuenta el intento y no sigue con los demás", async () => {
    await enqueueMessage(message("a", "2026-11-23T10:01:00.000Z"));
    await enqueueMessage(message("b", "2026-11-23T10:02:00.000Z"));
    upsertMessage.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    expect(await flushOutbox()).toBe(0);
    const items = await listOutbox();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: "a", attempts: 1, lastError: "Failed to fetch" });
    expect(upsertMessage).toHaveBeenCalledTimes(1);
  });

  test("una solicitud pendiente se inserta y luego se notifica; la notificación fallida no la bloquea", async () => {
    await enqueueRequest({ request: { id: "req-1", agreed_price: 500 }, notification: { user: "p1" }, subjectName: "Pintura" });
    insertRequest.mockResolvedValue(undefined);
    createNotification.mockRejectedValue(new Error("CHECK"));

    expect(await flushOutbox()).toBe(1);
    expect(insertRequest).toHaveBeenCalledWith({ id: "req-1", agreed_price: 500 });
    expect(await listOutbox()).toEqual([]);
  });
});
