import { config } from "../config";
import { supabase, throwIfError } from "../lib/supabase";

// Suscripción Web Push del navegador, guardada en web_push_subscription (RLS: cada quien las suyas).

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function isPushSupported() {
  return typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;
}

export type PushState = "unsupported" | "denied" | "off" | "on";

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

const applicationServerKey = base64UrlToBytes(config.vapidPublicKey);

async function save(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  const { error } = await supabase.from("web_push_subscription").upsert(
    {
      user: userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  throwIfError(error);
}

/**
 * Debe llamarse directo desde el toque: Safari solo acepta pushManager.subscribe() durante el gesto.
 * Si el permiso no se ha decidido, esta misma llamada lo pide.
 */
export async function enablePush(userId: string, registration: ServiceWorkerRegistration) {
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  });
  try {
    await save(userId, subscription);
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from("web_push_subscription").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}

/** Al abrir la app se vuelve a guardar la suscripción: pudo cambiar o el backend pudo borrarla. */
export async function resyncPush(userId: string) {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await save(userId, subscription).catch(() => undefined);
}
