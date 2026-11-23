import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

// Mismo esquema y mismas reglas que la app móvil, en el proyecto de Supabase de la PWA. La sesión vive en localStorage (sb-<ref>-auth-token).
export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export function throwIfError(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

/** Los avatares se guardan como URL completa y las fotos como ruta del bucket: acepta ambos. */
export function publicUrl(bucket: string, value: string | null | undefined): string {
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  return supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl;
}

/** Error de red (sin conexión o servidor inalcanzable), a diferencia de un error de la base de datos. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message);
}
