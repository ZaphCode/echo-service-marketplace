import { supabase, throwIfError } from "../lib/supabase";
import type { Coords, ProfileDetails, Role, User } from "./models";
import { compressImage } from "../utils/images";

// Perfiles y registro: mismo flujo que la app móvil (src/hooks/useRegister.ts, src/api/profiles.ts).
const clientProfileSelect = "*, user_profile:profiles!user(*)";
const providerProfileSelect =
  "*, user_profile:profiles!user(*), specialty_category:service_category!specialty(*)";

export async function getProfile(userId: string): Promise<User> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  throwIfError(error);
  return data as User;
}

export async function getProfileDetails(user: Pick<User, "id" | "role">): Promise<ProfileDetails | null> {
  const table = user.role === "provider" ? "provider_profile" : "client_profile";
  const select = user.role === "provider" ? providerProfileSelect : clientProfileSelect;
  const { data, error } = await supabase.from(table).select(select).eq("user", user.id).maybeSingle();
  throwIfError(error);
  return data as ProfileDetails | null;
}

export async function emailInUse(email: string) {
  const { data } = await supabase.from("profiles").select("id").eq("email", email).limit(1);
  return (data?.length ?? 0) > 0;
}

export type ContactInput = { phone: string; address: string; city: string; state: string; zip: string };
export type ProviderInput = {
  specialty: string;
  experience_years: number;
  description: string;
  available_days: string[];
};

export type SignUpInput = {
  email: string;
  password: string;
  name: string;
  role: Role;
  contact: ContactInput;
  provider?: ProviderInput;
  location: Coords | null;
};

/**
 * Registro: name y role viajan en los metadatos porque el trigger handle_new_user crea la fila de
 * profiles con ellos; después se crea client_profile o provider_profile, como en la app móvil.
 */
export async function signUp(input: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { name: input.name, role: input.role, email_visibility: true } },
  });
  throwIfError(error);
  const userId = data.user?.id;
  if (!userId || !data.session) throw new Error("No se pudo iniciar la sesión después del registro.");

  if (input.location) {
    await supabase.from("profiles").update({ location: input.location }).eq("id", userId);
  }

  const details =
    input.role === "provider"
      ? supabase.from("provider_profile").insert({ user: userId, ...input.contact, ...input.provider })
      : supabase.from("client_profile").insert({ user: userId, ...input.contact });
  const { error: detailsError } = await details;
  throwIfError(detailsError);
  return userId;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      /invalid login credentials/i.test(error.message)
        ? "Correo o contraseña incorrectos."
        : "No pudimos iniciar sesión. Inténtalo de nuevo.",
    );
  }
  return data.user;
}

export async function updateContact(table: "client_profile" | "provider_profile", rowId: string, contact: ContactInput) {
  const { error } = await supabase.from(table).update(contact).eq("id", rowId);
  throwIfError(error);
}

export async function updateProviderInfo(rowId: string, info: ProviderInput) {
  const { error } = await supabase.from("provider_profile").update(info).eq("id", rowId);
  throwIfError(error);
}

export async function updateAvatar(userId: string, original: File): Promise<string> {
  const file = await compressImage(original);
  const ext = /png$/i.test(file.type) ? "png" : /webp$/i.test(file.type) ? "webp" : "jpg";
  const path = `${userId}/avatar_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
  throwIfError(error);
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await supabase.from("profiles").update({ avatar: url }).eq("id", userId);
  throwIfError(updateError);
  return url;
}

/** La base redondea la ubicación a ~550 m (trigger snap_profile_location). */
export async function updateLocation(userId: string, location: Coords) {
  const { error } = await supabase.from("profiles").update({ location }).eq("id", userId);
  throwIfError(error);
}

export const DAYS = [
  ["MON", "Lun"],
  ["TUE", "Mar"],
  ["WED", "Mié"],
  ["THU", "Jue"],
  ["FRI", "Vie"],
  ["SAT", "Sáb"],
  ["SUN", "Dom"],
] as const;

/** El seed usa códigos en español (LUN…) y la app escribe en inglés (MON…): se aceptan ambos. */
const SPANISH_DAYS: Record<string, string> = { LUN: "MON", MAR: "TUE", MIE: "WED", JUE: "THU", VIE: "FRI", SAB: "SAT", DOM: "SUN" };
export function normalizeDays(days: string[] | null | undefined): string[] {
  return (days ?? []).map((day) => SPANISH_DAYS[day.toUpperCase()] ?? day.toUpperCase());
}
