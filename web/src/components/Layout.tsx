import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useSignedInUser } from "../auth/AuthContext";
import { useActivity } from "../hooks/useActivity";
import { usePwa } from "../pwa/PwaContext";
import Icon from "./Icon";
import "./Layout.css";

type Toast = { id: number; text: string; tone?: "success" | "danger" };
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone}>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ConnectionBanner() {
  const { online, updateReady, applyUpdate } = usePwa();
  if (updateReady) {
    return (
      <div className="banner banner-update" role="status">
        <span>Hay una versión nueva de Echo.</span>
        <button className="btn btn-primary btn-sm" type="button" onClick={applyUpdate}>
          Actualizar
        </button>
      </div>
    );
  }
  if (online) return null;
  return (
    <div className="banner banner-offline" role="status">
      <Icon name="cloud-off" size={16} />
      <span>Sin conexión. Ves lo último guardado; tus mensajes se enviarán al reconectar.</span>
    </div>
  );
}

/** Estructura de la app con sesión: contenido + barra inferior (móvil) o lateral (escritorio). */
export default function Layout() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const { unreadNotifications, unreadChats, waiting } = useActivity(user.id, { realtime: true });
  const requestDot = unreadChats + waiting > 0;

  const tabs = [
    { to: "/", label: "Inicio", icon: "home", end: true },
    { to: "/solicitudes", label: "Solicitudes", icon: "chat", dot: requestDot },
    { to: "/notificaciones", label: "Avisos", icon: "bell", count: unreadNotifications },
    { to: "/perfil", label: "Perfil", icon: "user" },
  ];

  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="tabbar" aria-label="Navegación principal">
        <span className="tabbar-brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Echo" width={40} height={40} />
        </span>
        {tabs.slice(0, 2).map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}
        <button className="tab-fab" type="button" onClick={() => navigate("/publicar")} aria-label="Publicar">
          <Icon name="plus" size={26} />
          <span className="tab-fab-label">Publicar</span>
        </button>
        {tabs.slice(2).map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}
      </nav>
      <div className="shell-main">
        <ConnectionBanner />
        <main id="contenido" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Tab({ to, label, icon, end, dot, count }: { to: string; label: string; icon: string; end?: boolean; dot?: boolean; count?: number }) {
  return (
    <NavLink to={to} end={end} className="tab">
      <span className="tab-icon">
        <Icon name={icon} size={22} />
        {count ? <span className="tab-count">{count > 9 ? "9+" : count}</span> : dot ? <span className="tab-dot" /> : null}
      </span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );
}
