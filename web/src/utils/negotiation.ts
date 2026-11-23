import type { AgreementState, ServiceRequest } from "../api/models";

// Reglas de la negociación, idénticas a la app móvil (src/utils/negotiation.ts,
// src/hooks/useRequestStatus.ts y src/components/NegotiationBlock.tsx). La PWA y la app escriben
// en la misma tabla service_request, así que deben producir exactamente los mismos cambios.

type Req = Pick<
  ServiceRequest,
  "client" | "provider" | "last_offer_user" | "agreement_state" | "client_offer_status" | "provider_offer_status" | "agreed_price" | "agreed_date"
>;

export const clientAgreed = (r: Req) => r.client_offer_status === "ACCEPTED";
export const providerAgreed = (r: Req) => r.provider_offer_status === "ACCEPTED";
export const bothAgreed = (r: Req) => clientAgreed(r) && providerAgreed(r);
export const clientRejected = (r: Req) => r.client_offer_status === "REJECTED";
export const providerRejected = (r: Req) => r.provider_offer_status === "REJECTED";
export const bothRejected = (r: Req) => clientRejected(r) && providerRejected(r);
export const clientCompleted = (r: Req) => r.client_offer_status === "COMPLETED";
export const providerCompleted = (r: Req) => r.provider_offer_status === "COMPLETED";
export const bothCompleted = (r: Req) => clientCompleted(r) && providerCompleted(r);

export type RequestPatch = Partial<
  Pick<
    ServiceRequest,
    "agreed_price" | "agreed_date" | "agreement_state" | "client_offer_status" | "provider_offer_status" | "last_offer_user" | "finished" | "canceled"
  >
>;

const isClient = (r: Req, userId: string) => r.client === userId;

/** Estado que se muestra: considera los casos en que ambas partes ya coinciden. */
export function displayState(r: Req): AgreementState {
  if (r.agreement_state === "FINISHED" || bothCompleted(r)) return "FINISHED";
  if (r.agreement_state === "CANCELED" || bothRejected(r)) return "CANCELED";
  if (r.agreement_state === "ACCEPTED" || bothAgreed(r)) return "ACCEPTED";
  return r.agreement_state;
}

export const STATE_LABELS: Record<AgreementState, string> = {
  NEGOTIATION: "Negociación",
  ACCEPTED: "Aceptado",
  CANCELED: "Cancelado",
  FINISHED: "Finalizado",
};

export const STATE_TONES: Record<AgreementState, string> = {
  NEGOTIATION: "accent",
  ACCEPTED: "success",
  CANCELED: "danger",
  FINISHED: "done",
};

/** Qué botones ve cada parte (NegotiationBlock de la app móvil). */
export function negotiationButtons(r: Req, userId: string) {
  const me = isClient(r, userId) ? "client" : "provider";
  const iAgreed = me === "client" ? clientAgreed(r) : providerAgreed(r);
  const iCompleted = me === "client" ? clientCompleted(r) : providerCompleted(r);
  const hasRejectedCurrentOffer = clientRejected(r) || providerRejected(r);

  const showCompletion = bothAgreed(r) || r.agreement_state === "ACCEPTED" || iCompleted;
  return {
    showCompletion,
    canRespond: !(hasRejectedCurrentOffer || iAgreed || iCompleted || bothAgreed(r)),
    canOffer: r.agreement_state === "NEGOTIATION" && (hasRejectedCurrentOffer || r.last_offer_user !== userId),
    canComplete: !iCompleted,
  };
}

/** Etiqueta del estado de cada parte: Completó / Aceptó / Rechazó / Ofertó / Pendiente. */
export function partyLabel(r: Req, party: "client" | "provider"): string {
  const status = party === "client" ? r.client_offer_status : r.provider_offer_status;
  if (status === "COMPLETED") return "Completó";
  if (status === "ACCEPTED") return "Aceptó";
  if (status === "REJECTED") return "Rechazó";
  return r.last_offer_user === r[party] ? "Ofertó" : "Pendiente";
}

/** Nueva propuesta: cambia precio y fecha y ambas partes vuelven a decidir. */
export function offerPatch(userId: string, price: number, date: string): RequestPatch {
  return {
    agreed_price: price,
    agreed_date: date,
    client_offer_status: "PENDING",
    provider_offer_status: "PENDING",
    last_offer_user: userId,
  };
}

/** Aceptar: el trato se cierra cuando la otra parte ya había aceptado (según la copia del servidor). */
export function acceptPatch(latest: Req, userId: string): RequestPatch {
  if (isClient(latest, userId)) {
    return providerAgreed(latest)
      ? { client_offer_status: "ACCEPTED", agreement_state: "ACCEPTED" }
      : { client_offer_status: "ACCEPTED" };
  }
  return clientAgreed(latest)
    ? { provider_offer_status: "ACCEPTED", agreement_state: "ACCEPTED" }
    : { provider_offer_status: "ACCEPTED" };
}

/** Rechazar: la solicitud se cancela solo cuando ambas partes rechazan. */
export function rejectPatch(latest: Req, userId: string, now = new Date()): RequestPatch {
  if (isClient(latest, userId)) {
    return providerRejected(latest)
      ? { client_offer_status: "REJECTED", agreement_state: "CANCELED", canceled: now.toISOString() }
      : { client_offer_status: "REJECTED" };
  }
  return clientRejected(latest)
    ? { provider_offer_status: "REJECTED", agreement_state: "CANCELED", canceled: now.toISOString() }
    : { provider_offer_status: "REJECTED" };
}

/** Completar: al marcarlo ambas partes queda FINISHED; el trigger del servidor suma el trabajo. */
export function completePatch(latest: Req, userId: string, now = new Date()): RequestPatch {
  if (isClient(latest, userId)) {
    return providerCompleted(latest)
      ? { client_offer_status: "COMPLETED", agreement_state: "FINISHED", finished: now.toISOString() }
      : { client_offer_status: "COMPLETED" };
  }
  return clientCompleted(latest)
    ? { provider_offer_status: "COMPLETED", agreement_state: "FINISHED", finished: now.toISOString() }
    : { provider_offer_status: "COMPLETED" };
}

/** Si la otra parte mandó una propuesta nueva mientras se revisaba, no se responde a ciegas. */
export function offerChanged(local: Req, latest: Req): boolean {
  return (
    Number(local.agreed_price) !== Number(latest.agreed_price) ||
    Date.parse(local.agreed_date) !== Date.parse(latest.agreed_date) ||
    local.last_offer_user !== latest.last_offer_user
  );
}

/** ¿Le toca responder a este usuario? Alimenta el contador del ícono (Badging API). */
export function isWaitingFor(r: Req, userId: string): boolean {
  const state = displayState(r);
  if (state === "NEGOTIATION") return negotiationButtons(r, userId).canRespond && r.last_offer_user !== userId;
  if (state === "ACCEPTED") return negotiationButtons(r, userId).canComplete;
  return false;
}
