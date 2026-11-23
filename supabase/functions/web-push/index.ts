// Edge Function «web-push»: la llaman los triggers de notification y message (pg_net) y envía el
// push a los navegadores suscritos del destinatario.
// Secretos (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, WEB_PUSH_SECRET.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.104.1";
import {
  messagePush,
  messageRecipient,
  notificationPush,
  TTL_SECONDS,
  type MessageRow,
  type NotificationRow,
  type PushMessage,
} from "./payload.ts";

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
};

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const sharedSecret = env("WEB_PUSH_SECRET");

async function unreadCount(userId: string) {
  const { count } = await db
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user", userId)
    .eq("read", false);
  return count ?? 0;
}

async function send(userId: string, message: PushMessage, ttl: number, urgency: "normal" | "high") {
  const { data: subscriptions } = await db
    .from("web_push_subscription")
    .select("endpoint, p256dh, auth")
    .eq("user", userId);

  const results = await Promise.allSettled(
    (subscriptions ?? []).map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
        TTL: ttl,
        urgency,
        topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
      }),
    ),
  );

  let sent = 0;
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }
    const status = (result.reason as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      // El navegador dio de baja la suscripción: se borra para no volver a intentarlo.
      await db.from("web_push_subscription").delete().eq("endpoint", subscriptions![index].endpoint);
    } else {
      // 429 u otra falla del servicio push: se registra y el resto sigue.
      console.warn(`[web-push] ${status ?? "sin respuesta"} para ${new URL(subscriptions![index].endpoint).host}`);
    }
  }
  console.info(`[web-push] ${userId}: ${sent}/${subscriptions?.length ?? 0} enviados`);
}

Deno.serve(async (request) => {
  if (request.headers.get("x-echo-secret") !== sharedSecret) {
    return new Response("No autorizado", { status: 401 });
  }

  const { table, record } = await request.json();
  try {
    if (table === "notification") {
      const row = record as NotificationRow;
      await send(row.user, notificationPush(row, await unreadCount(row.user)), TTL_SECONDS.notification, "normal");
    } else if (table === "message") {
      const row = record as MessageRow;
      const { data: req } = await db.from("service_request").select("client, provider").eq("id", row.request).single();
      const { data: sender } = await db.from("profiles").select("name").eq("id", row.sender).single();
      if (req) {
        const recipient = messageRecipient(req, row.sender);
        await send(recipient, messagePush(row, sender?.name ?? "Nuevo mensaje", await unreadCount(recipient)), TTL_SECONDS.message, "high");
      }
    }
  } catch (error) {
    console.error("[web-push]", error);
    return new Response("Error", { status: 500 });
  }
  return new Response(null, { status: 204 });
});
