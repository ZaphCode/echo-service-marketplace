// APIs del dispositivo que usa Echo: Badging, Web Share, Geolocation e instalación.

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Número en el ícono de la app instalada: notificaciones sin leer + solicitudes que esperan respuesta. */
export async function setBadge(count: number) {
  const nav = navigator as BadgingNavigator;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Badging solo existe en la app instalada de algunos navegadores; fuera de ahí no hace nada.
  }
}

export type ShareResult = "shared" | "copied" | "canceled" | "failed";

/** Web Share con plan B: copiar el enlace al portapapeles. */
export async function shareLink(data: { title: string; text: string; url: string }): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return "canceled";
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}

export type GeoError = "unsupported" | "denied" | "unavailable" | "timeout";

/** Ubicación aproximada del dispositivo; se usa para ordenar por cercanía. */
export function getPosition(timeout = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject("unsupported" satisfies GeoError);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) =>
        reject((error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable") satisfies GeoError),
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60_000 },
    );
  });
}

export const GEO_MESSAGES: Record<GeoError, string> = {
  unsupported: "Este navegador no puede obtener tu ubicación.",
  denied: "No diste permiso de ubicación. Puedes activarlo en la configuración del sitio.",
  unavailable: "No se pudo obtener tu ubicación. Revisa que el GPS esté activo.",
  timeout: "La ubicación tardó demasiado. Inténtalo de nuevo.",
};

export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
