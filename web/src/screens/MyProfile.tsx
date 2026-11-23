import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useSignedInUser } from "../auth/AuthContext";
import { listCategories } from "../api/catalog";
import { DAYS, normalizeDays, updateAvatar, updateContact, updateProviderInfo, type ContactInput } from "../api/profiles";
import type { ProfileDetails } from "../api/models";
import { useUserLocation } from "../hooks/useLocation";
import { usePwa } from "../pwa/PwaContext";
import { isIOS } from "../pwa/device";
import { useToast } from "../components/Layout";
import { ProfessionalInfo, ProfileHeader, ReviewList, useProfileData } from "../components/ProfileView";
import PushToggle from "../components/PushToggle";
import Sheet from "../components/Sheet";
import Icon from "../components/Icon";
import { validatePhone, validateZip } from "../utils/validations";
import { applyTheme, readTheme, type ThemePreference } from "../theme/theme";
import "./auth.css";

export default function MyProfile() {
  const user = useSignedInUser();
  const { signOut, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pwa = usePwa();
  const location = useUserLocation();
  const data = useProfileData(user);
  const [editing, setEditing] = useState<"contact" | "provider" | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(readTheme);
  const details = data.details.data;

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    try {
      await updateAvatar(user.id, file);
      await refreshUser();
      toast("Foto actualizada.", "success");
    } catch (error) {
      toast(`No se pudo subir la foto: ${(error as Error).message}`, "danger");
    }
  }

  async function install() {
    const outcome = await pwa.install();
    if (outcome === "accepted") toast("¡Echo quedó instalada!", "success");
  }

  async function updateMyLocation() {
    const coords = await location.locate();
    if (coords) toast("Ubicación actualizada. Solo se publica tu zona aproximada.", "success");
  }

  return (
    <div className="page detail">
      <ProfileHeader
        user={user}
        data={data}
        avatarAction={
          <label className="avatar-edit" title="Cambiar foto">
            <Icon name="camera" size={16} />
            <input className="visually-hidden" type="file" accept="image/*" onChange={(event) => void changeAvatar(event.target.files?.[0])} />
          </label>
        }
      />

      <section className="section">
        <div className="section-title">
          <h2>Datos de contacto</h2>
          {details ? (
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setEditing("contact")}>
              <Icon name="edit" size={14} /> Editar
            </button>
          ) : null}
        </div>
        <div className="panel info-grid">
          <div className="span-2">
            <span className="subtle">Correo</span>
            <strong>{user.email}</strong>
          </div>
          <div>
            <span className="subtle">Teléfono</span>
            <strong>{details?.phone || "—"}</strong>
          </div>
          <div>
            <span className="subtle">Código postal</span>
            <strong>{details?.zip || "—"}</strong>
          </div>
          <div className="span-2">
            <span className="subtle">Dirección</span>
            <strong>{details ? [details.address, details.city, details.state].filter(Boolean).join(", ") || "—" : "—"}</strong>
          </div>
        </div>
      </section>

      <ProfessionalInfo details={details} />
      {details && "specialty" in details ? (
        <button className="btn btn-ghost" type="button" onClick={() => setEditing("provider")}>
          <Icon name="edit" size={16} /> Editar información profesional
        </button>
      ) : null}

      <ReviewList data={data} />

      <section className="section">
        <h2>Preferencias</h2>
        <PushToggle />
        <div className="settings">
          {!pwa.installed && (pwa.canInstall || isIOS()) ? (
            <button className="setting" type="button" onClick={pwa.canInstall ? install : () => toast("En Safari: Compartir › Agregar a inicio.")}>
              <Icon name="download" />
              <span>
                Instalar Echo
                <br />
                <small className="subtle">Ábrela desde tu pantalla de inicio, también sin conexión.</small>
              </span>
            </button>
          ) : null}
          <button className="setting" type="button" onClick={updateMyLocation} disabled={location.locating}>
            <Icon name="navigation" />
            <span>
              {location.locating ? "Obteniendo ubicación…" : "Actualizar mi ubicación"}
              <br />
              <small className="subtle">{location.error ?? "Ordena los servicios por cercanía. Se publica solo tu zona (~500 m)."}</small>
            </span>
          </button>
          <label className="setting">
            <Icon name="grid" />
            <span>Tema</span>
            <select
              value={theme}
              onChange={(event) => {
                const next = event.target.value as ThemePreference;
                setTheme(next);
                applyTheme(next);
              }}
            >
              <option value="auto">Automático</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <button className="setting danger" type="button" onClick={() => void signOut()}>
            <Icon name="logout" />
            <span>Cerrar sesión</span>
          </button>
        </div>
        <p className="subtle center">Echo PWA v{__APP_VERSION__}</p>
      </section>

      <Sheet open={editing === "contact"} title="Datos de contacto" onClose={() => setEditing(null)}>
        {details ? (
          <ContactForm
            details={details}
            onSaved={async () => {
              setEditing(null);
              await queryClient.invalidateQueries({ queryKey: ["profile-details", user.id] });
              toast("Datos actualizados.", "success");
            }}
            table={user.role === "provider" ? "provider_profile" : "client_profile"}
          />
        ) : null}
      </Sheet>
      <Sheet open={editing === "provider"} title="Información profesional" onClose={() => setEditing(null)}>
        {details && "specialty" in details ? (
          <ProviderForm
            details={details}
            onSaved={async () => {
              setEditing(null);
              await queryClient.invalidateQueries({ queryKey: ["profile-details", user.id] });
              toast("Información actualizada.", "success");
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function ContactForm({ details, table, onSaved }: { details: ProfileDetails; table: "client_profile" | "provider_profile"; onSaved: () => void }) {
  const [form, setForm] = useState<ContactInput>({
    phone: details.phone,
    address: details.address,
    city: details.city,
    state: details.state,
    zip: details.zip,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validatePhone(form.phone) ?? validateZip(form.zip);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await updateContact(table, details.id, form);
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <label className="field">
        <span>Teléfono</span>
        <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      <label className="field">
        <span>Dirección</span>
        <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Ciudad</span>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </label>
        <label className="field">
          <span>Código postal</span>
          <input className="input" inputMode="numeric" maxLength={5} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Estado</span>
        <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
      </label>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        Guardar
      </button>
    </form>
  );
}

function ProviderForm({ details, onSaved }: { details: Extract<ProfileDetails, { specialty: string | null }>; onSaved: () => void }) {
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });
  const [specialty, setSpecialty] = useState(details.specialty ?? "");
  const [years, setYears] = useState(String(details.experience_years ?? 0));
  const [description, setDescription] = useState(details.description);
  const [days, setDays] = useState(normalizeDays(details.available_days));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(years);
    if (!specialty) return setError("Elige tu especialidad");
    if (!Number.isInteger(value) || value < 0 || value > 100) return setError("Los años deben ser un número de 0 a 100");
    if (days.length === 0) return setError("Elige al menos un día");
    setBusy(true);
    try {
      await updateProviderInfo(details.id, { specialty, experience_years: value, description: description.trim(), available_days: days });
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <label className="field">
        <span>Especialidad</span>
        <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
          <option value="">Elige una categoría</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Años de experiencia</span>
        <input className="input" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
      </label>
      <label className="field">
        <span>Descripción</span>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field">
        <span>Días disponibles</span>
        <div className="days">
          {DAYS.map(([code, label]) => (
            <button
              key={code}
              type="button"
              className="day"
              aria-pressed={days.includes(code)}
              onClick={() => setDays(days.includes(code) ? days.filter((day) => day !== code) : [...days, code])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        Guardar
      </button>
    </form>
  );
}
