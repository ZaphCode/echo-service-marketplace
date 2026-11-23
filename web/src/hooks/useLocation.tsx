import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Coords } from "../api/models";
import { updateLocation } from "../api/profiles";
import { useAuth } from "../auth/AuthContext";
import { getPosition, GEO_MESSAGES, type GeoError } from "../pwa/device";
import { distanceKm, isValidCoords } from "../utils/geo";

type LocationState = {
  /** Ubicación para ordenar por cercanía: la del dispositivo o, si no, la guardada en el perfil. */
  coords: Coords | null;
  source: "device" | "profile" | null;
  error: string | null;
  locating: boolean;
  locate: () => Promise<Coords | null>;
};

const LocationContext = createContext<LocationState | null>(null);
const STORAGE_KEY = "echo.deviceCoords";

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [device, setDevice] = useState<Coords | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      return isValidCoords(saved) ? saved : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const coords = await getPosition();
      setDevice(coords);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
      // Como la app móvil: el proveedor actualiza su ubicación pública si se movió 1 km o más.
      if (user?.role === "provider" && (!user.location || (distanceKm(user.location, coords) ?? 0) >= 1)) {
        void updateLocation(user.id, coords).catch(() => undefined);
      }
      return coords;
    } catch (reason) {
      setError(GEO_MESSAGES[reason as GeoError] ?? GEO_MESSAGES.unavailable);
      return null;
    } finally {
      setLocating(false);
    }
  }, [user]);

  // Solo se pide la ubicación sola si el permiso ya estaba concedido; si no, espera al botón.
  useEffect(() => {
    if (device || !user) return;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (status.state === "granted") void locate();
      })
      .catch(() => undefined);
  }, [device, user, locate]);

  const value = useMemo<LocationState>(() => {
    const profile = isValidCoords(user?.location) ? user!.location! : null;
    return {
      coords: device ?? profile,
      source: device ? "device" : profile ? "profile" : null,
      error,
      locating,
      locate,
    };
  }, [device, user, error, locating, locate]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useUserLocation fuera de LocationProvider");
  return context;
}
