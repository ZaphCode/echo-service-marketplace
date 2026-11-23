import { useEffect, useState } from "react";
import { useSignedInUser } from "../auth/AuthContext";
import { usePwa } from "../pwa/PwaContext";
import { disablePush, enablePush, getPushState, isPushSupported, resyncPush, type PushState } from "../pwa/push";
import { isIOS, isStandalone } from "../pwa/device";
import { useToast } from "./Layout";
import Icon from "./Icon";
import "./PushToggle.css";

/** Activar o desactivar los avisos push de este dispositivo. */
export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const user = useSignedInUser();
  const { registration } = usePwa();
  const toast = useToast();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }
    void getPushState().then(setState);
    // Al abrir la app se vuelve a guardar la suscripción, por si cambió o el backend la borró.
    void resyncPush(user.id);
  }, [user.id, registration]);

  async function toggle() {
    if (!registration) return;
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
        toast("Avisos desactivados en este dispositivo.");
      } else {
        // Se llama directo desde el toque: Safari solo permite suscribirse durante el gesto.
        await enablePush(user.id, registration);
        setState("on");
        toast("Avisos activados: te avisaremos aunque la app esté cerrada.", "success");
      }
    } catch (error) {
      const denied = Notification.permission === "denied";
      setState(denied ? "denied" : "off");
      if (!denied) toast(`No se pudieron activar los avisos: ${(error as Error).message}`, "danger");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    if (compact && !(isIOS() && !isStandalone())) return null;
    return (
      <div className="push-card">
        <Icon name="bell" />
        <p className="muted">
          {isIOS() && !isStandalone()
            ? "En iPhone, los avisos funcionan desde la app instalada: Compartir › Agregar a inicio."
            : "Este navegador no admite notificaciones push."}
        </p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="push-card">
        <Icon name="bell" />
        <p className="muted">
          Bloqueaste los avisos para este sitio. Actívalos en la configuración del navegador (ícono junto a la dirección › Notificaciones) y recarga.
        </p>
      </div>
    );
  }

  return (
    <div className="push-card">
      <Icon name="bell" />
      <div>
        <strong>Avisos en este dispositivo</strong>
        <p className="muted">
          {state === "on"
            ? "Recibes un aviso con cada solicitud, propuesta o mensaje, aunque la app esté cerrada."
            : "Activa los avisos para enterarte de propuestas y mensajes sin tener la app abierta."}
        </p>
      </div>
      <button className={`btn btn-sm ${state === "on" ? "btn-ghost" : "btn-primary"}`} type="button" onClick={toggle} disabled={busy || !registration} aria-pressed={state === "on"}>
        {state === "on" ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}
