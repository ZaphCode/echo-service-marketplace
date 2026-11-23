import { supabase, throwIfError } from "../lib/supabase";
import { compressImage } from "../utils/images";
import type {
  Category,
  Contracting,
  ContractingWithOwner,
  Coords,
  ReviewWithProfiles,
  ServiceWithDetails,
  ServiceWithProvider,
} from "./models";

// Mismos select que la app móvil (src/api/services.ts, contractings.ts, reviews.ts).
export const serviceCardSelect = "*, provider_profile:profiles!provider(*)";
export const serviceDetailSelect = "*, provider_profile:profiles!provider(*), category_detail:service_category!category(*)";
export const contractingCardSelect = "*, owner_profile:profiles!owner(*)";
export const reviewSelect = "*, reviewer_profile:profiles!reviewer(*), reviewed_profile:profiles!reviewed(*)";

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("service_category").select("id, name").order("name");
  throwIfError(error);
  return data ?? [];
}

/**
 * Servicios ordenados por cercanía (RPC list_services_nearby con PostGIS). Va por GET para que el
 * Service Worker pueda guardar la respuesta y mostrar el catálogo sin conexión.
 */
export async function listServicesNearby(category: string, coords: Coords | null): Promise<ServiceWithProvider[]> {
  const { data, error } = await supabase
    .rpc(
      "list_services_nearby",
      { p_lat: coords?.lat ?? null, p_lon: coords?.lon ?? null, p_category: category },
      { get: true },
    )
    .select(serviceCardSelect);
  throwIfError(error);
  return (data ?? []) as unknown as ServiceWithProvider[];
}

export async function listContractingsNearby(
  category: string,
  userId: string,
  coords: Coords | null,
): Promise<ContractingWithOwner[]> {
  const { data, error } = await supabase
    .rpc(
      "list_contractings_nearby",
      { p_lat: coords?.lat ?? null, p_lon: coords?.lon ?? null, p_category: category, p_user: userId },
      { get: true },
    )
    .select(contractingCardSelect);
  throwIfError(error);
  return (data ?? []) as unknown as ContractingWithOwner[];
}

export async function searchServices(search: string): Promise<ServiceWithDetails[]> {
  const q = search.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("service")
    .select(serviceDetailSelect)
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  throwIfError(error);
  return (data ?? []) as ServiceWithDetails[];
}

export async function getService(id: string): Promise<ServiceWithDetails> {
  const { data, error } = await supabase.from("service").select(serviceDetailSelect).eq("id", id).single();
  throwIfError(error);
  return data as ServiceWithDetails;
}

export async function getContracting(id: string): Promise<ContractingWithOwner> {
  const { data, error } = await supabase.from("contracting").select(contractingCardSelect).eq("id", id).single();
  throwIfError(error);
  return data as ContractingWithOwner;
}

export async function listServiceReviews(serviceId: string): Promise<ReviewWithProfiles[]> {
  const { data, error } = await supabase
    .from("review")
    .select(reviewSelect)
    .eq("service", serviceId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReviewWithProfiles[];
}

/** Promedio de las reseñas de un servicio, igual que la tarjeta de la app móvil. */
export async function getServiceRatings(serviceIds: string[]): Promise<Record<string, { average: number; count: number }>> {
  if (serviceIds.length === 0) return {};
  const { data, error } = await supabase.from("review").select("service, rating").in("service", serviceIds);
  throwIfError(error);
  const summary: Record<string, { average: number; count: number }> = {};
  for (const row of data ?? []) {
    const entry = (summary[row.service as string] ??= { average: 0, count: 0 });
    entry.average = (entry.average * entry.count + Number(row.rating)) / (entry.count + 1);
    entry.count += 1;
  }
  return summary;
}

export type ServiceInput = {
  providerId: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  photos: (string | File)[];
};

/** Sube las fotos nuevas a service-photos/<uid>/… y conserva las rutas existentes. */
async function uploadPhotos(ownerId: string, prefix: "service" | "contracting", photos: (string | File)[]) {
  const paths: string[] = [];
  for (const [index, original] of photos.entries()) {
    if (typeof original === "string") {
      paths.push(original);
      continue;
    }
    const photo = await compressImage(original);
    const ext = /png$/i.test(photo.type) ? "png" : /webp$/i.test(photo.type) ? "webp" : "jpg";
    const path = `${ownerId}/${prefix}_${Date.now()}_${index}.${ext}`;
    const { error } = await supabase.storage
      .from("service-photos")
      .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: true });
    throwIfError(error);
    paths.push(path);
  }
  return paths;
}

export async function saveService(input: ServiceInput, serviceId?: string): Promise<ServiceWithProvider> {
  const photos = await uploadPhotos(input.providerId, "service", input.photos);
  const row = {
    name: input.name,
    description: input.description,
    category: input.category,
    base_price: input.basePrice,
    photos,
  };
  const query = serviceId
    ? supabase.from("service").update(row).eq("id", serviceId)
    : supabase.from("service").insert({ ...row, provider: input.providerId });
  const { data, error } = await query.select(serviceCardSelect).single();
  throwIfError(error);
  return data as ServiceWithProvider;
}

export type ContractingInput = {
  ownerId: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  photos: (string | File)[];
  /** Punto exacto: solo lo ve el dueño; la base publica una copia redondeada a ~550 m. */
  location: Coords | null | undefined;
};

export async function saveContracting(input: ContractingInput, contractingId?: string): Promise<Contracting> {
  const photos = await uploadPhotos(input.ownerId, "contracting", input.photos);
  const row = { name: input.name, description: input.description, category: input.category, base_price: input.basePrice, photos };
  const query = contractingId
    ? supabase.from("contracting").update(row).eq("id", contractingId)
    : supabase.from("contracting").insert({ ...row, owner: input.ownerId });
  const { data, error } = await query.select("*").single();
  throwIfError(error);
  const contracting = data as Contracting;

  // Nunca se escriben lat/lon directo: el trigger copia el punto privado ya redondeado.
  if (input.location === null && contractingId) {
    await supabase.from("contracting_location_private").delete().eq("contracting", contracting.id);
  } else if (input.location) {
    const { error: locationError } = await supabase
      .from("contracting_location_private")
      .upsert({ contracting: contracting.id, lat: input.location.lat, lon: input.location.lon });
    if (locationError) console.warn("[Echo] No se guardó la ubicación de la contratación:", locationError.message);
  }
  return contracting;
}

export async function getContractingPrivateLocation(contractingId: string): Promise<Coords | null> {
  const { data } = await supabase
    .from("contracting_location_private")
    .select("lat, lon")
    .eq("contracting", contractingId)
    .maybeSingle();
  return data ? { lat: data.lat, lon: data.lon } : null;
}
