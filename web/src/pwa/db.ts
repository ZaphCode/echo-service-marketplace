import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// IndexedDB compartida entre la página y el Service Worker (sw.ts abre la misma base).
export const DB_NAME = "echo-pwa";
export const DB_VERSION = 1;

export type OutboxItem =
  | { id: string; kind: "message"; createdAt: string; attempts: number; lastError?: string; payload: MessageJob }
  | { id: string; kind: "request"; createdAt: string; attempts: number; lastError?: string; payload: RequestJob };

export type MessageJob = {
  client_id: string;
  created_at_client: string;
  content: string;
  sender: string;
  request: string;
};

export type RequestJob = {
  request: Record<string, unknown>;
  notification: Record<string, unknown> | null;
  subjectName: string;
};

/** Lo mínimo para que el Service Worker escriba en Supabase sin la página abierta. */
export type SessionSnapshot = { id: "current"; accessToken: string; expiresAt: number; userId: string };

interface EchoDB extends DBSchema {
  outbox: { key: string; value: OutboxItem };
  session: { key: string; value: SessionSnapshot };
}

let dbPromise: Promise<IDBPDatabase<EchoDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<EchoDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("session")) db.createObjectStore("session", { keyPath: "id" });
    },
  });
  return dbPromise;
}

export async function saveSession(snapshot: Omit<SessionSnapshot, "id"> | null) {
  const db = await getDb();
  if (snapshot) await db.put("session", { id: "current", ...snapshot });
  else await db.delete("session", "current");
}
