import { supabase, throwIfError } from "../lib/supabase";
import type { Message, NotificationType, ReviewWithProfiles, ServiceRequestWithRelations, User } from "./models";
import { reviewSelect } from "./catalog";
import type { RequestPatch } from "../utils/negotiation";

// Solicitudes, mensajes, reseñas y notificaciones: mismas consultas que la app móvil
// (src/api/serviceRequests.ts, messages.ts, reviews.ts, notifications.ts).
export const serviceRequestSelect =
  "*, service_detail:service!service(*, provider_profile:profiles!provider(*)), contracting_detail:contracting!contracting(*, owner_profile:profiles!owner(*)), client_profile:profiles!client(*), provider_profile:profiles!provider(*)";

export async function listUserRequests(userId: string): Promise<ServiceRequestWithRelations[]> {
  const { data, error } = await supabase
    .from("service_request")
    .select(serviceRequestSelect)
    .or(`client.eq.${userId},provider.eq.${userId}`)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ServiceRequestWithRelations[];
}

export async function getRequest(id: string): Promise<ServiceRequestWithRelations> {
  const { data, error } = await supabase.from("service_request").select(serviceRequestSelect).eq("id", id).single();
  throwIfError(error);
  return data as ServiceRequestWithRelations;
}

/** Solicitud existente del cliente para un servicio (botón «Ir al chat» en lugar de «Solicitar»). */
export async function findRequestForService(serviceId: string, clientId: string) {
  const { data, error } = await supabase
    .from("service_request")
    .select("id")
    .eq("service", serviceId)
    .eq("client", clientId)
    .order("updated_at", { ascending: false })
    .limit(1);
  throwIfError(error);
  return data?.[0]?.id as string | undefined;
}

export async function findApplication(contractingId: string, providerId: string) {
  const { data, error } = await supabase
    .from("service_request")
    .select("id")
    .eq("contracting", contractingId)
    .eq("provider", providerId)
    .limit(1);
  throwIfError(error);
  return data?.[0]?.id as string | undefined;
}

export type NewRequest = {
  id: string;
  service: string | null;
  contracting: string | null;
  client: string;
  provider: string;
  last_offer_user: string;
  agreed_price: number;
  agreed_date: string;
  notes: string;
  agreement_state: "NEGOTIATION";
  client_offer_status: "PENDING";
  provider_offer_status: "PENDING";
};

/** El id lo genera el dispositivo: si Background Sync reintenta el envío, la solicitud no se duplica. */
export async function insertRequest(payload: NewRequest) {
  const { error } = await supabase
    .from("service_request")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
  throwIfError(error);
}

export async function updateRequest(id: string, patch: RequestPatch): Promise<ServiceRequestWithRelations> {
  const { data, error } = await supabase
    .from("service_request")
    .update(patch)
    .eq("id", id)
    .select(serviceRequestSelect)
    .single();
  throwIfError(error);
  return data as ServiceRequestWithRelations;
}

/** Respaldo idempotente: el trigger del servidor ya cuenta el trabajo al pasar a FINISHED. */
export async function finalizeRequestCompletion(requestId: string) {
  await supabase.rpc("finalize_request_completion", { request_id: requestId });
}

export type NewNotification = {
  user: string;
  message: string;
  type: NotificationType;
  request: string;
  service: string | null;
  contracting: string | null;
};

/** Sin .select(): RLS solo deja leer la notificación a quien la recibe. */
export async function createNotification(notification: NewNotification) {
  const { error } = await supabase
    .from("notification")
    .insert({ id: crypto.randomUUID(), read: false, ...notification });
  throwIfError(error);
}

export async function listMessages(requestId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("message")
    .select("*")
    .eq("request", requestId)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return data ?? [];
}

/** Formato de client_id de la app móvil: client:<uid>:<iso>:<aleatorio>. */
export function newMessageClientId(userId: string, isoDate: string) {
  return `client:${userId}:${isoDate}:${Math.random().toString(36).slice(2, 10)}`;
}

export type NewMessage = {
  client_id: string;
  created_at_client: string;
  content: string;
  sender: string;
  request: string;
};

/** upsert por client_id: reenviar el mismo mensaje no lo duplica. */
export async function upsertMessage(message: NewMessage): Promise<Message> {
  const { data, error } = await supabase
    .from("message")
    .upsert(message, { onConflict: "client_id", ignoreDuplicates: false })
    .select("*")
    .single();
  throwIfError(error);
  return data as Message;
}

/** Mensajes recibidos en varias solicitudes (para los indicadores de no leídos). */
export async function listIncomingMessages(requestIds: string[], userId: string) {
  if (requestIds.length === 0) return [];
  const { data, error } = await supabase
    .from("message")
    .select("id, request, sender, created_at")
    .in("request", requestIds)
    .neq("sender", userId);
  throwIfError(error);
  return data ?? [];
}

export async function hasReviewed(reviewer: string, subject: { type: "service" | "contracting"; id: string }) {
  const { data, error } = await supabase
    .from("review")
    .select("id")
    .eq("reviewer", reviewer)
    .eq(subject.type, subject.id)
    .limit(1);
  throwIfError(error);
  return (data?.length ?? 0) > 0;
}

export async function createReview(review: {
  service?: string;
  contracting?: string;
  request: string;
  reviewer: string;
  reviewed: string;
  rating: number;
  comment: string;
  type: "AS_CLIENT" | "AS_PROVIDER";
}) {
  const { error } = await supabase.from("review").insert(review);
  throwIfError(error);
}

export async function listReviewsForUser(userId: string): Promise<ReviewWithProfiles[]> {
  const { data, error } = await supabase
    .from("review")
    .select(reviewSelect)
    .eq("reviewed", userId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReviewWithProfiles[];
}

export async function countFinishedJobs(userId: string) {
  const { count, error } = await supabase
    .from("service_request")
    .select("id", { count: "exact", head: true })
    .eq("agreement_state", "FINISHED")
    .or(`client.eq.${userId},provider.eq.${userId}`);
  throwIfError(error);
  return count ?? 0;
}

export async function listNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notification")
    .select("*")
    .eq("user", userId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return data ?? [];
}

export async function countUnreadNotifications(userId: string) {
  const { count, error } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user", userId)
    .eq("read", false);
  throwIfError(error);
  return count ?? 0;
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("notification").update({ read: true }).in("id", ids);
  throwIfError(error);
}

/** Quién está del otro lado según el usuario actual. */
export function counterpart(request: ServiceRequestWithRelations, userId: string): User {
  return request.client === userId ? request.provider_profile : request.client_profile;
}

export type Subject = { type: "service" | "contracting"; id: string; name: string; base_price: number; photos: string[]; ownerId: string };

export function requestSubject(request: ServiceRequestWithRelations): Subject {
  if (request.contracting_detail) {
    const c = request.contracting_detail;
    return { type: "contracting", id: c.id, name: c.name, base_price: Number(c.base_price), photos: c.photos ?? [], ownerId: c.owner };
  }
  if (request.service_detail) {
    const s = request.service_detail;
    return { type: "service", id: s.id, name: s.name, base_price: Number(s.base_price), photos: s.photos ?? [], ownerId: s.provider };
  }
  return {
    type: request.contracting ? "contracting" : "service",
    id: request.contracting ?? request.service ?? request.id,
    name: "Publicación",
    base_price: Number(request.agreed_price),
    photos: [],
    ownerId: request.client,
  };
}
