import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getProfile } from "../api/profiles";
import type { User } from "../api/models";
import { saveSession } from "../pwa/db";

type AuthState = {
  status: "loading" | "signed-out" | "signed-in";
  session: Session | null;
  user: User | null;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const EPOCH_KEY = "echo.dataEpoch";

/** El Service Worker no lee localStorage: se le deja el token vigente en IndexedDB para Background Sync. */
function mirrorSession(session: Session | null) {
  void saveSession(
    session
      ? { accessToken: session.access_token, expiresAt: session.expires_at ?? 0, userId: session.user.id }
      : null,
  );
}

/**
 * Si el equipo reinicia la base con el seed, app_meta.data_epoch cambia y la sesión guardada ya no
 * sirve (los usuarios se recrearon). Igual que la app móvil: se cierra la sesión local.
 */
async function checkDataEpoch() {
  try {
    const { data } = await supabase.from("app_meta").select("data_epoch").limit(1).maybeSingle();
    const epoch = data?.data_epoch as string | undefined;
    if (!epoch) return true;
    const known = localStorage.getItem(EPOCH_KEY);
    localStorage.setItem(EPOCH_KEY, epoch);
    return !known || known === epoch;
  } catch {
    return true; // Sin conexión: se conserva la sesión.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  const loadUser = useCallback(async (current: Session | null) => {
    if (!current) {
      setUser(null);
      setStatus("signed-out");
      return;
    }
    try {
      const profile = await getProfile(current.user.id);
      setUser(profile);
      localStorage.setItem("echo.user", JSON.stringify(profile));
    } catch {
      // Sin conexión: se usa el último perfil conocido para que la app abra offline.
      const cached = localStorage.getItem("echo.user");
      setUser(cached ? (JSON.parse(cached) as User) : null);
    }
    setStatus("signed-in");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session && !(await checkDataEpoch())) {
        await supabase.auth.signOut({ scope: "local" });
        setSession(null);
        mirrorSession(null);
        await loadUser(null);
        return;
      }
      setSession(data.session);
      mirrorSession(data.session);
      await loadUser(data.session);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "INITIAL_SESSION") return;
      setSession(next);
      mirrorSession(next);
      // No se espera a Supabase dentro del callback (bloquea supabase-js); se carga después.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => void loadUser(next), 0);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadUser]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      user,
      refreshUser: () => loadUser(session),
      signOut: async () => {
        await supabase.auth.signOut();
        localStorage.removeItem("echo.user");
        queryClient.clear();
      },
    }),
    [status, session, user, loadUser, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth fuera de AuthProvider");
  return context;
}

/** Para pantallas que solo existen con sesión: el usuario ya está cargado. */
export function useSignedInUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("Pantalla sin sesión");
  return user;
}
