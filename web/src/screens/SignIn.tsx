import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { signIn } from "../api/profiles";
import { validateEmail } from "../utils/validations";
import { Logo } from "../components/ui";
import "./auth.css";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError || !password) {
      setError(emailError ?? "La contraseña es requerida");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // AuthContext detecta la sesión y la ruta pública redirige al inicio.
    } catch (reason) {
      setError(navigator.onLine ? (reason as Error).message : "Necesitas conexión para iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <Logo width={168} />
        <h1>Bienvenido de vuelta</h1>
        <p className="muted">Plomeros, electricistas y más profesionales de tu colonia, a un mensaje de distancia.</p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Correo</span>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.com"
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <p className="auth-foot">
        ¿Aún no tienes cuenta? <Link to="/registro">Crea una</Link>
      </p>
    </div>
  );
}
