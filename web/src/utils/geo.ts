import type { Coords } from "../api/models";

// Igual que src/utils/geo.ts de la app móvil y public.snap_coord / public.distance_bucket.
const EARTH_RADIUS_KM = 6371;
const SNAP_STEP_DEG = 0.005;

export function isValidCoords(value: unknown): value is Coords {
  if (!value || typeof value !== "object") return false;
  const { lat, lon } = value as Partial<Coords>;
  return typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** La base guarda las ubicaciones públicas en una cuadrícula de ~550 m; aquí se aplica la misma regla. */
export function snapCoords({ lat, lon }: Coords): Coords {
  const snap = (value: number) => Number((Math.round(value / SNAP_STEP_DEG) * SNAP_STEP_DEG).toFixed(3));
  return { lat: snap(lat), lon: snap(lon) };
}

export function haversineKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceKm(origin: Coords | null | undefined, target: Coords | null | undefined): number | null {
  if (!isValidCoords(origin) || !isValidCoords(target)) return null;
  return haversineKm(origin, target);
}

export function formatDistance(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return "";
  if (km < 1) return `a ${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  if (km < 10) return `a ${km.toFixed(1)} km`;
  return `a ${Math.round(km)} km`;
}

export function toCoords(lat: number | null | undefined, lon: number | null | undefined): Coords | null {
  const coords = { lat, lon };
  return isValidCoords(coords) ? coords : null;
}
