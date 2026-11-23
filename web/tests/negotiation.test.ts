import { describe, expect, test } from "vitest";
import type { ServiceRequest } from "../src/api/models";
import {
  acceptPatch,
  completePatch,
  displayState,
  isWaitingFor,
  negotiationButtons,
  offerChanged,
  offerPatch,
  partyLabel,
  rejectPatch,
} from "../src/utils/negotiation";

// Los mismos casos que la app móvil (src/hooks/useRequestStatus.ts): la PWA debe escribir los mismos
// cambios en service_request para que ambas apps se entiendan.
const CLIENT = "client-1";
const PROVIDER = "provider-1";
const NOW = new Date("2026-11-23T10:00:00.000Z");

function request(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: "request-1",
    client: CLIENT,
    provider: PROVIDER,
    service: "service-1",
    contracting: null,
    last_offer_user: CLIENT,
    agreed_price: 500,
    agreed_date: "2026-11-30T19:00:00.000Z",
    notes: "",
    agreement_state: "NEGOTIATION",
    client_offer_status: "PENDING",
    provider_offer_status: "PENDING",
    requested: "2026-11-23T09:00:00.000Z",
    updated_at: "2026-11-23T09:00:00.000Z",
    ...overrides,
  };
}

describe("aceptar", () => {
  test("si la otra parte no ha aceptado, solo cambia mi estado", () => {
    expect(acceptPatch(request(), PROVIDER)).toEqual({ provider_offer_status: "ACCEPTED" });
  });

  test("si la otra parte ya aceptó, el trato pasa a ACCEPTED", () => {
    expect(acceptPatch(request({ client_offer_status: "ACCEPTED" }), PROVIDER)).toEqual({
      provider_offer_status: "ACCEPTED",
      agreement_state: "ACCEPTED",
    });
    expect(acceptPatch(request({ provider_offer_status: "ACCEPTED" }), CLIENT)).toEqual({
      client_offer_status: "ACCEPTED",
      agreement_state: "ACCEPTED",
    });
  });
});

describe("rechazar", () => {
  test("un solo rechazo no cancela", () => {
    expect(rejectPatch(request(), CLIENT, NOW)).toEqual({ client_offer_status: "REJECTED" });
  });

  test("cancela solo cuando ambas partes rechazan", () => {
    expect(rejectPatch(request({ client_offer_status: "REJECTED" }), PROVIDER, NOW)).toEqual({
      provider_offer_status: "REJECTED",
      agreement_state: "CANCELED",
      canceled: NOW.toISOString(),
    });
  });
});

describe("completar", () => {
  test("FINISHED cuando ambas partes marcan completado", () => {
    const accepted = request({ agreement_state: "ACCEPTED", client_offer_status: "ACCEPTED", provider_offer_status: "ACCEPTED" });
    expect(completePatch(accepted, CLIENT, NOW)).toEqual({ client_offer_status: "COMPLETED" });
    expect(completePatch({ ...accepted, client_offer_status: "COMPLETED" }, PROVIDER, NOW)).toEqual({
      provider_offer_status: "COMPLETED",
      agreement_state: "FINISHED",
      finished: NOW.toISOString(),
    });
  });
});

test("una contrapropuesta reinicia ambas decisiones y registra quién ofertó", () => {
  expect(offerPatch(PROVIDER, 650, "2026-12-01T19:00:00.000Z")).toEqual({
    agreed_price: 650,
    agreed_date: "2026-12-01T19:00:00.000Z",
    client_offer_status: "PENDING",
    provider_offer_status: "PENDING",
    last_offer_user: PROVIDER,
  });
});

describe("botones (NegotiationBlock)", () => {
  test("quien hizo la última oferta no puede volver a ofertar; la otra parte sí", () => {
    expect(negotiationButtons(request(), CLIENT).canOffer).toBe(false);
    expect(negotiationButtons(request(), PROVIDER).canOffer).toBe(true);
  });

  test("después de un rechazo nadie acepta, pero ambos pueden ofertar", () => {
    const rejected = request({ provider_offer_status: "REJECTED" });
    expect(negotiationButtons(rejected, CLIENT)).toMatchObject({ canRespond: false, canOffer: true });
    expect(negotiationButtons(rejected, PROVIDER)).toMatchObject({ canRespond: false, canOffer: true });
  });

  test("con el trato aceptado se muestran los botones de completar", () => {
    const accepted = request({ agreement_state: "ACCEPTED", client_offer_status: "ACCEPTED", provider_offer_status: "ACCEPTED" });
    expect(negotiationButtons(accepted, CLIENT)).toMatchObject({ showCompletion: true, canComplete: true });
    expect(negotiationButtons({ ...accepted, client_offer_status: "COMPLETED" }, CLIENT).canComplete).toBe(false);
  });
});

test("estado mostrado y etiquetas de cada parte", () => {
  expect(displayState(request({ client_offer_status: "ACCEPTED", provider_offer_status: "ACCEPTED" }))).toBe("ACCEPTED");
  expect(displayState(request({ client_offer_status: "REJECTED", provider_offer_status: "REJECTED" }))).toBe("CANCELED");
  expect(partyLabel(request(), "client")).toBe("Ofertó");
  expect(partyLabel(request(), "provider")).toBe("Pendiente");
  expect(partyLabel(request({ provider_offer_status: "ACCEPTED" }), "provider")).toBe("Aceptó");
});

test("detecta una propuesta que cambió mientras se revisaba", () => {
  const local = request();
  expect(offerChanged(local, { ...local })).toBe(false);
  expect(offerChanged(local, { ...local, agreed_price: 600 })).toBe(true);
  expect(offerChanged(local, { ...local, last_offer_user: PROVIDER })).toBe(true);
  expect(offerChanged(local, { ...local, agreed_date: "2026-11-30T19:00:00Z" })).toBe(false);
});

test("a quién le toca responder (contador del ícono)", () => {
  expect(isWaitingFor(request(), PROVIDER)).toBe(true);
  expect(isWaitingFor(request(), CLIENT)).toBe(false);
  expect(isWaitingFor(request({ agreement_state: "FINISHED" }), CLIENT)).toBe(false);
});
