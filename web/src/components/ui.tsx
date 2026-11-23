import type { ReactNode } from "react";
import { publicUrl } from "../lib/supabase";
import { AVATARS_BUCKET, SERVICE_PHOTOS_BUCKET } from "../config";
import { initials } from "../utils/format";
import type { AgreementState, User } from "../api/models";
import { STATE_LABELS, STATE_TONES } from "../utils/negotiation";
import Icon from "./Icon";
import "./ui.css";

export function Avatar({ user, size = 40 }: { user: Pick<User, "name" | "avatar"> | null | undefined; size?: number }) {
  const src = publicUrl(AVATARS_BUCKET, user?.avatar);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" loading="lazy" width={size} height={size} /> : initials(user?.name ?? "") || "?"}
    </span>
  );
}

export function Photo({ path, alt, className, eager = false }: { path?: string | null; alt: string; className?: string; eager?: boolean }) {
  const src = publicUrl(SERVICE_PHOTOS_BUCKET, path);
  return (
    <div className={`photo ${className ?? ""}`}>
      {src ? (
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} />
      ) : (
        <Icon name="image" size={28} />
      )}
    </div>
  );
}

export function StatePill({ state }: { state: AgreementState }) {
  return (
    <span className="pill" data-tone={STATE_TONES[state]}>
      {STATE_LABELS[state]}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rounded ? "on" : ""}>
          <Icon name="star" size={size} fill={star <= rounded} />
        </span>
      ))}
    </span>
  );
}

export function RatingChip({ average, count }: { average: number; count: number }) {
  if (count === 0) return <span className="rating-chip muted">Sin reseñas</span>;
  return (
    <span className="rating-chip">
      <Icon name="star" size={13} fill /> {average.toFixed(1)} <span className="subtle">({count})</span>
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <EmptyState
      icon={offline ? "cloud-off" : "alert"}
      title={offline ? "Sin conexión" : "No pudimos cargar esto"}
      action={
        onRetry ? (
          <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>
            <Icon name="refresh" size={16} /> Reintentar
          </button>
        ) : undefined
      }
    >
      {offline
        ? "Esta información todavía no estaba guardada en el dispositivo. Vuelve a intentarlo con conexión."
        : String((error as Error)?.message ?? error)}
    </EmptyState>
  );
}

export function Skeletons({ count = 3, height = 96 }: { count?: number; height?: number }) {
  return (
    <div className="skeletons" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function BackHeader({ title, subtitle, actions, onBack }: { title?: string; subtitle?: string; actions?: ReactNode; onBack: () => void }) {
  return (
    <header className="back-header">
      <button className="icon-btn" type="button" onClick={onBack} aria-label="Regresar">
        <Icon name="back" />
      </button>
      <div className="back-header-text">
        {title ? <h1 className="back-title">{title}</h1> : null}
        {subtitle ? <p className="subtle">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** Logotipo en su versión clara u oscura según el tema. */
export function Logo({ width = 120 }: { width?: number }) {
  const base = import.meta.env.BASE_URL;
  const height = Math.round((width * 119) / 336);
  return (
    <span className="logo" style={{ width, height }}>
      <img className="logo-dark" src={`${base}icons/logo-white.png`} alt="Echo" width={width} height={height} />
      <img className="logo-light" src={`${base}icons/logo-black.png`} alt="" aria-hidden="true" width={width} height={height} />
    </span>
  );
}
