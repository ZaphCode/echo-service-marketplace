import { describe, expect, test } from "vitest";
import { distanceKm, formatDistance, snapCoords } from "../src/utils/geo";
import { boldSegments, formatPrice, formatRelativeDate, initials } from "../src/utils/format";
import { dateInputToIso, isoToDateInput, validateDate, validatePhone, validatePrice, validateZip } from "../src/utils/validations";
import { normalizeDays } from "../src/api/profiles";
import { messagePush, messageRecipient, notificationPush, plainText } from "../../supabase/functions/web-push/payload";
import { base64UrlToBytes } from "../src/pwa/push";

describe("geolocalización", () => {
  test("redondea a la misma cuadrícula de ~550 m que public.snap_coord", () => {
    expect(snapCoords({ lat: 24.14263, lon: -110.31281 })).toEqual({ lat: 24.145, lon: -110.315 });
  });

  test("distancia La Paz → Cabo San Lucas y su etiqueta", () => {
    const km = distanceKm({ lat: 24.1426, lon: -110.3128 }, { lat: 22.8905, lon: -109.9167 })!;
    expect(Math.round(km)).toBe(145);
    expect(formatDistance(km)).toBe("a 145 km");
    expect(formatDistance(0.04)).toBe("a 100 m");
    expect(formatDistance(3.26)).toBe("a 3.3 km");
    expect(distanceKm(null, { lat: 1, lon: 1 })).toBeNull();
  });
});

describe("formatos", () => {
  test("precio en pesos sin decimales", () => {
    expect(formatPrice(1100)).toBe("$1,100");
  });

  test("fecha relativa", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(formatRelativeDate("2026-11-23T11:59:30Z", now)).toBe("Hace un momento");
    expect(formatRelativeDate("2026-11-23T11:20:00Z", now)).toBe("Hace 40 min");
    expect(formatRelativeDate("2026-11-20T12:00:00Z", now)).toBe("Hace 3 días");
  });

  test("negritas de las notificaciones de la app (*texto*)", () => {
    expect(boldSegments("*Luis* aceptó la propuesta para *Pintura*")).toEqual([
      { text: "Luis", bold: true },
      { text: " aceptó la propuesta para ", bold: false },
      { text: "Pintura", bold: true },
    ]);
    expect(initials("Valeria Talamantes")).toBe("VT");
  });
});

describe("validaciones (mismas reglas que la app)", () => {
  test("teléfono, código postal y precio", () => {
    expect(validatePhone("624 166 3329")).toBeNull();
    expect(validatePhone("12345")).not.toBeNull();
    expect(validateZip("23000")).toBeNull();
    expect(validateZip("2300")).not.toBeNull();
    expect(validatePrice("450.50")).toBeNull();
    expect(validatePrice("0")).toBe("El precio debe ser mayor a cero");
  });

  test("la fecha no puede ser anterior a hoy y conserva el día al guardarse", () => {
    expect(validateDate("2020-01-01")).toBe("La fecha no puede ser anterior a hoy");
    expect(isoToDateInput(dateInputToIso("2030-05-17"))).toBe("2030-05-17");
  });

  test("días disponibles del seed (LUN…) y de la app (MON…)", () => {
    expect(normalizeDays(["LUN", "MIE", "SAT"])).toEqual(["MON", "WED", "SAT"]);
  });
});

describe("contenido de los push (Edge Function web-push)", () => {
  test("una notificación de la app se convierte en push con ruta relativa y contador", () => {
    expect(
      notificationPush({ id: "n1", user: "u1", type: "CLIENT:NEW_OFFER", message: "*Luis* hizo una nueva propuesta para *AC*", request: "r1" }, 3),
    ).toEqual({ title: "Nueva propuesta", body: "Luis hizo una nueva propuesta para AC", url: "#/chat/r1", tag: "request-r1", badge: 3 });
    expect(plainText(" *hola* ")).toBe("hola");
  });

  test("un mensaje va a la otra parte de la solicitud", () => {
    expect(messageRecipient({ client: "c", provider: "p" }, "c")).toBe("p");
    expect(messageRecipient({ client: "c", provider: "p" }, "p")).toBe("c");
    expect(messagePush({ id: "m", request: "r1", sender: "c", content: "¿Mañana a las 10?" }, "Valeria", 1)).toMatchObject({
      title: "Valeria",
      url: "#/chat/r1",
      tag: "chat-r1",
    });
  });

  test("la llave VAPID se decodifica de base64url", () => {
    expect([...base64UrlToBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});
