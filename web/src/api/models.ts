// Tipos de las tablas de Supabase: los mismos que src/models de la app móvil.

export type Role = "client" | "provider";
export type AgreementState = "NEGOTIATION" | "ACCEPTED" | "CANCELED" | "FINISHED";
export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED";
export type NotificationType =
  | "PROVIDER:NEW_REQUEST"
  | "PROVIDER:NEW_APPLICATION"
  | "CLIENT:NEW_OFFER"
  | "PROVIDER:NEW_OFFER"
  | "SYSTEM:INFO";

export type Coords = { lat: number; lon: number };

export type User = {
  id: string;
  email: string;
  avatar: string;
  name: string;
  role: Role;
  email_visibility: boolean;
  verified: boolean;
  location?: Coords | null;
  created_at: string;
  updated_at: string;
};

export type Category = { id: string; name: string };

export type Service = {
  id: string;
  provider: string;
  category: string;
  name: string;
  description: string;
  base_price: number;
  photos: string[] | null;
  created_at: string;
  updated_at: string;
};

export type Contracting = {
  id: string;
  owner: string;
  category: string;
  name: string;
  description: string;
  base_price: number;
  photos: string[];
  lat?: number | null;
  lon?: number | null;
  is_closed: boolean;
  closed_at?: string | null;
  closed_request?: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceRequest = {
  id: string;
  client: string;
  provider: string;
  service?: string | null;
  contracting?: string | null;
  last_offer_user: string;
  agreed_price: number;
  agreed_date: string;
  notes: string;
  agreement_state: AgreementState;
  client_offer_status: OfferStatus;
  provider_offer_status: OfferStatus;
  finished?: string | null;
  canceled?: string | null;
  job_counted_at?: string | null;
  requested: string;
  updated_at: string;
};

export type Message = {
  id: string;
  request: string;
  sender: string;
  content: string;
  created_at: string;
  updated_at: string;
  client_id?: string | null;
  created_at_client?: string | null;
};

export type Review = {
  id: string;
  service?: string | null;
  contracting?: string | null;
  request?: string | null;
  reviewer: string;
  reviewed: string;
  comment: string;
  rating: number;
  type: "AS_CLIENT" | "AS_PROVIDER";
  created_at: string;
};

export type Notification = {
  id: string;
  user: string;
  message: string;
  type: NotificationType;
  read: boolean;
  request?: string | null;
  service?: string | null;
  contracting?: string | null;
  created_at: string;
};

export type ClientProfile = {
  id: string;
  user: string;
  phone: string;
  address: string;
  zip: string;
  state: string;
  city: string;
};

export type ProviderProfile = ClientProfile & {
  specialty: string | null;
  description: string;
  jobs_done: number;
  experience_years: number;
  available_days: string[] | null;
};

export type ServiceWithProvider = Service & { provider_profile: User };
export type ServiceWithDetails = ServiceWithProvider & { category_detail?: Category };
export type ContractingWithOwner = Contracting & { owner_profile: User };

export type ServiceRequestWithRelations = ServiceRequest & {
  service_detail?: ServiceWithProvider | null;
  contracting_detail?: ContractingWithOwner | null;
  client_profile: User;
  provider_profile: User;
};

export type ReviewWithProfiles = Review & { reviewer_profile: User; reviewed_profile: User };

export type ProfileDetails =
  | (ClientProfile & { user_profile: User })
  | (ProviderProfile & { user_profile: User; specialty_category: Category | null });
