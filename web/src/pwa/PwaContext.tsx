import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isStandalone, type InstallPromptEvent } from "./device";
import { startOutboxListeners } from "./outbox";

type PwaState = {
  online: boolean;
  registration: ServiceWorkerRegistration | null;
  updateReady: boolean;
  applyUpdate: () => void;
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

const PwaContext = createContext<PwaState | null>(null);

export function PwaProvider({ children, onNavigate }: { children: ReactNode; onNavigate: (hash: string) => void }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  // Conexión
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Registro del Service Worker y aviso de versión nueva (registerType: "prompt").
  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
    const base = import.meta.env.BASE_URL;
    let reloading = false;

    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then((reg) => {
      setRegistration(reg);
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      // Revisa si hay versión nueva cada hora mientras la app esté abierta.
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    // El clic en una notificación pide abrir una pantalla de la SPA sin recargar.
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "navigate") return;
      const url = new URL(event.data.url as string);
      if (url.origin === location.origin) onNavigate(url.hash || "#/");
    });
    startOutboxListeners();
  }, [onNavigate]);

  // Instalación
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const value = useMemo<PwaState>(
    () => ({
      online,
      registration,
      updateReady: waiting !== null,
      applyUpdate: () => waiting?.postMessage({ type: "SKIP_WAITING" }),
      canInstall: installEvent !== null,
      installed,
      install: async () => {
        if (!installEvent) return "unavailable";
        await installEvent.prompt();
        const { outcome } = await installEvent.userChoice;
        setInstallEvent(null);
        return outcome === "accepted" ? "accepted" : "dismissed";
      },
    }),
    [online, registration, waiting, installEvent, installed],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("usePwa fuera de PwaProvider");
  return context;
}
