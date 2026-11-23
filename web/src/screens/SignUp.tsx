import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listCategories } from "../api/catalog";
import { DAYS, emailInUse, signUp } from "../api/profiles";
import type { Coords, Role } from "../api/models";
import { getPosition, GEO_MESSAGES, type GeoError } from "../pwa/device";
import { Logo } from "../components/ui";
import Icon from "../components/Icon";
import {
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
  validateZip,
} from "../utils/validations";
import "./auth.css";

type Errors = Record<string, string | null>;

/** Registro en tres pasos, como la app móvil: cuenta → contacto → datos profesionales (proveedores). */
export default function SignUp() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>("client");
  const [account, setAccount] = useState({ name: "", email: "", password: "", confirm: "" });
  const [contact, setContact] = useState({ phone: "", address: "", city: "La Paz", state: "Baja California Sur", zip: "" });
  const [provider, setProvider] = useState({ specialty: "", experience: "", description: "", days: [] as string[] });
  const [location, setLocation] = useState<Coords | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });

  const totalSteps = role === "provider" ? 3 : 2;

  async function nextFromAccount(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {
      name: validateName(account.name),
      email: validateEmail(account.email),
      password: validatePassword(account.password),
      confirm: account.confirm === account.password ? null : "Las contraseñas no coinciden",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      if (await emailInUse(account.email.trim())) {
        setErrors({ email: "Ese correo ya está registrado" });
        return;
      }
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  async function useMyLocation() {
    setLocationMessage("Obteniendo tu ubicación…");
    try {
      const coords = await getPosition();
      setLocation(coords);
      setLocationMessage("Ubicación lista. Solo se publica tu zona aproximada (~500 m), nunca tu dirección.");
    } catch (reason) {
      setLocationMessage(GEO_MESSAGES[reason as GeoError] ?? GEO_MESSAGES.unavailable);
    }
  }

  async function nextFromContact(event: FormEvent) {
    event.preventDefault();
    const next: Errors = { phone: validatePhone(contact.phone), zip: validateZip(contact.zip) };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (role === "provider") setStep(2);
    else await finish();
  }

  async function nextFromProvider(event: FormEvent) {
    event.preventDefault();
    const years = Number(provider.experience);
    const next: Errors = {
      specialty: provider.specialty ? null : "Elige tu especialidad",
      experience: Number.isInteger(years) && years >= 0 && years <= 100 ? null : "Escribe un número de 0 a 100",
      days: provider.days.length ? null : "Elige al menos un día",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    await finish();
  }

  async function finish() {
    setBusy(true);
    setFormError(null);
    try {
      await signUp({
        email: account.email.trim(),
        password: account.password,
        name: account.name.trim(),
        role,
        contact: { ...contact, phone: contact.phone.trim(), zip: contact.zip.trim() },
        provider:
          role === "provider"
            ? {
                specialty: provider.specialty,
                experience_years: Number(provider.experience),
                description: provider.description.trim(),
                available_days: provider.days,
              }
            : undefined,
        location,
      });
    } catch (reason) {
      setFormError(`No pudimos crear tu cuenta. ${(reason as Error).message}`);
      setBusy(false);
    }
  }

  const fieldError = (name: string) =>
    errors[name] ? (
      <small className="error-text" role="alert">
        {errors[name]}
      </small>
    ) : null;

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo width={132} />
        <h1>{step === 0 ? "Crea tu cuenta" : step === 1 ? "Tus datos de contacto" : "Tu perfil profesional"}</h1>
        <div className="steps" aria-label={`Paso ${step + 1} de ${totalSteps}`} style={{ width: "100%" }}>
          {Array.from({ length: totalSteps }, (_, index) => (
            <span key={index} className={index <= step ? "done" : ""} />
          ))}
        </div>
      </div>

      {step === 0 ? (
        <form className="form" onSubmit={nextFromAccount} noValidate>
          <div className="field">
            <span>Tipo de cuenta</span>
            <div className="role-picker">
              {(
                [
                  ["client", "Cliente", "Busco quién me ayude"],
                  ["provider", "Profesional", "Ofrezco mis servicios"],
                ] as const
              ).map(([value, title, hint]) => (
                <button key={value} type="button" className="role-option" aria-pressed={role === value} onClick={() => setRole(value)}>
                  <strong>{title}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
            <small className="hint">El tipo de cuenta no se puede cambiar después.</small>
          </div>
          <label className="field">
            <span>Nombre</span>
            <input className="input" autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
            {fieldError("name")}
          </label>
          <label className="field">
            <span>Correo</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
            {fieldError("email")}
          </label>
          <div className="form-row">
            <label className="field">
              <span>Contraseña</span>
              <input className="input" type="password" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
              {fieldError("password")}
            </label>
            <label className="field">
              <span>Confirmar</span>
              <input className="input" type="password" autoComplete="new-password" value={account.confirm} onChange={(e) => setAccount({ ...account, confirm: e.target.value })} />
              {fieldError("confirm")}
            </label>
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            Continuar
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <form className="form" onSubmit={nextFromContact} noValidate>
          <label className="field">
            <span>Teléfono</span>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            {fieldError("phone")}
          </label>
          <label className="field">
            <span>Dirección</span>
            <input className="input" autoComplete="street-address" placeholder="Calle y colonia" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Ciudad</span>
              <input className="input" autoComplete="address-level2" value={contact.city} onChange={(e) => setContact({ ...contact, city: e.target.value })} />
            </label>
            <label className="field">
              <span>Código postal</span>
              <input className="input" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={contact.zip} onChange={(e) => setContact({ ...contact, zip: e.target.value })} />
              {fieldError("zip")}
            </label>
          </div>
          <div className="field">
            <span>Ubicación aproximada</span>
            <button className="btn btn-ghost" type="button" onClick={useMyLocation}>
              <Icon name="navigation" size={18} /> {location ? "Actualizar mi ubicación" : "Usar mi ubicación"}
            </button>
            <small className="hint">{locationMessage ?? "Sirve para mostrarte primero lo más cercano. Es opcional."}</small>
          </div>
          {formError ? <p className="error-text" role="alert">{formError}</p> : null}
          <div className="form-row">
            <button className="btn btn-ghost" type="button" onClick={() => setStep(0)}>
              Atrás
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {role === "provider" ? "Continuar" : busy ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form className="form" onSubmit={nextFromProvider} noValidate>
          <label className="field">
            <span>Especialidad</span>
            <select className="select" value={provider.specialty} onChange={(e) => setProvider({ ...provider, specialty: e.target.value })}>
              <option value="">Elige una categoría</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldError("specialty")}
          </label>
          <label className="field">
            <span>Años de experiencia</span>
            <input className="input" inputMode="numeric" value={provider.experience} onChange={(e) => setProvider({ ...provider, experience: e.target.value })} />
            {fieldError("experience")}
          </label>
          <label className="field">
            <span>Descripción</span>
            <textarea className="textarea" value={provider.description} onChange={(e) => setProvider({ ...provider, description: e.target.value })} placeholder="Cuéntales a tus clientes qué haces y cómo trabajas." />
          </label>
          <div className="field">
            <span>Días disponibles</span>
            <div className="days">
              {DAYS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className="day"
                  aria-pressed={provider.days.includes(code)}
                  onClick={() =>
                    setProvider({
                      ...provider,
                      days: provider.days.includes(code) ? provider.days.filter((day) => day !== code) : [...provider.days, code],
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {fieldError("days")}
          </div>
          {formError ? <p className="error-text" role="alert">{formError}</p> : null}
          <div className="form-row">
            <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      ) : null}

      <p className="auth-foot">
        ¿Ya tienes cuenta? <Link to="/entrar">Ingresa</Link>
      </p>
    </div>
  );
}
