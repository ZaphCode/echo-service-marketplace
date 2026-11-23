// Configuración de la PWA. La llave publicable identifica al proyecto de Supabase y puede ir en el
// frontend: los permisos reales los decide RLS en la base de datos.
export const config = Object.freeze({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "https://sceynbcizhrekrarxfnt.supabase.co",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_sU8H93EVBQtrSdM1uSM8PA_tlxx7i1S",
  // Llave pública VAPID de la Edge Function web-push (la privada solo está en los secretos de Supabase).
  vapidPublicKey: "BHFQwOSMNkK0iheUuvInG6VFcpcKPaBvJg-Lj5Fz84R8VXr2SDuqdbHOEf-kaQI0EL0-0pXLqBjuDts1yIm2Vx4",
  // Ubicación por defecto cuando el usuario no comparte la suya: centro de La Paz, B.C.S.
  defaultCenter: { lat: 24.1426, lon: -110.3128 },
});

export const SERVICE_PHOTOS_BUCKET = "service-photos";
export const AVATARS_BUCKET = "avatars";
