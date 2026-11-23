import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { countUnreadNotifications, listIncomingMessages, listUserRequests } from "../api/requests";
import { isWaitingFor } from "../utils/negotiation";
import { setBadge } from "../pwa/device";

export const queryKeys = {
  requests: (userId: string) => ["requests", userId] as const,
  unreadNotifications: (userId: string) => ["notifications", "unread", userId] as const,
  notifications: (userId: string) => ["notifications", userId] as const,
  incoming: (userId: string) => ["messages", "incoming", userId] as const,
};

/** Marca de lectura del chat: igual que la app móvil, vive solo en el dispositivo. */
export function readMarkerKey(userId: string, requestId: string) {
  return `echo.read.${userId}.${requestId}`;
}

export function markChatRead(userId: string, requestId: string, isoDate: string) {
  const current = localStorage.getItem(readMarkerKey(userId, requestId));
  if (!current || current < isoDate) localStorage.setItem(readMarkerKey(userId, requestId), isoDate);
}

/**
 * Actividad del usuario: solicitudes, mensajes sin leer y notificaciones. Se refresca con Supabase
 * Realtime y alimenta el número del ícono de la app (Badging API).
 */
export function useActivity(userId: string, { realtime = false }: { realtime?: boolean } = {}) {
  const queryClient = useQueryClient();

  const requests = useQuery({ queryKey: queryKeys.requests(userId), queryFn: () => listUserRequests(userId) });
  const unreadNotifications = useQuery({
    queryKey: queryKeys.unreadNotifications(userId),
    queryFn: () => countUnreadNotifications(userId),
  });
  const requestIds = (requests.data ?? []).map((request) => request.id);
  const incoming = useQuery({
    queryKey: [...queryKeys.incoming(userId), requestIds.join(",")],
    queryFn: () => listIncomingMessages(requestIds, userId),
    enabled: requestIds.length > 0,
  });

  const unreadByRequest: Record<string, number> = {};
  for (const message of incoming.data ?? []) {
    const readAt = localStorage.getItem(readMarkerKey(userId, message.request));
    if (!readAt || message.created_at > readAt) unreadByRequest[message.request] = (unreadByRequest[message.request] ?? 0) + 1;
  }
  const waiting = (requests.data ?? []).filter((request) => isWaitingFor(request, userId)).length;
  const unreadChats = Object.keys(unreadByRequest).length;

  // Número en el ícono: notificaciones sin leer + chats con mensajes nuevos.
  const badge = (unreadNotifications.data ?? 0) + unreadChats;
  useEffect(() => {
    if (realtime) void setBadge(badge);
  }, [badge, realtime]);

  // Realtime: cambios en solicitudes, mensajes o notificaciones del usuario refrescan los datos.
  useEffect(() => {
    if (!realtime) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["messages", "incoming"] });
    };
    const channel = supabase
      .channel(`activity_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification", filter: `user=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_request", filter: `client=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_request", filter: `provider=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient, realtime]);

  return { requests, unreadNotifications: unreadNotifications.data ?? 0, unreadByRequest, waiting, unreadChats };
}
