import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@/models/User";
import {
  cacheAuthUser,
  getCachedAuthUserById,
} from "@/offline/store";
import { verifyOfflineCredential } from "@/offline/auth";
import { getProfileByUser } from "@/api/profiles";
import { reconcileLocalDataWithServer } from "@/offline/reset";
import { withTimeout } from "@/utils/async";

/** Longest the splash waits for the network before showing the app. */
const STARTUP_BUDGET_MS = 6000;
const MIN_SESSION_WAIT_MS = 1500;
const PROFILE_TIMEOUT_MS = 8000;
const SESSION_PENDING = Symbol("session-pending");

const initialUser: User = {
  id: "",
  email: "",
  name: "",
  role: "client",
  created_at: "",
  updated_at: "",
  avatar: "",
  email_visibility: false,
  verified: false,
};

type AuthData = {
  user: User;
  authenticated: boolean;
  authMode: "online" | "offline";
};

const signedOutAuth: AuthData = {
  user: initialUser,
  authenticated: false,
  authMode: "offline",
};

type AuthContextType = {
  user: User;
  authenticated: boolean;
  authMode: "online" | "offline";
  login: (user: User, mode?: "online" | "offline") => void;
  offlineLogin: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authData, setAuthData] = useState<AuthData>(signedOutAuth);
  // Mirror of authData readable from the auth listener (which is created once).
  const authRef = useRef<AuthData>(signedOutAuth);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // User of the most recent auth event. A slow profile fetch started by an
    // older event must not overwrite a newer state (e.g. after signing out).
    let latestUserId: string | null = null;

    const applyAuth = (next: AuthData) => {
      authRef.current = next;
      setAuthData(next);
    };

    const applyOnlineProfile = async (userId: string) => {
      const profile = await withTimeout(
        fetchProfile(userId),
        PROFILE_TIMEOUT_MS,
        null
      );
      if (!profile) return null;

      await cacheAuthUser(profile, true);
      // Only warms the offline cache: never block the UI on it.
      cacheProfileDetailsBestEffort(profile);

      if (active && latestUserId === userId) {
        applyAuth({ user: profile, authenticated: true, authMode: "online" });
      }
      return profile;
    };

    const restoreSession = async (userId: string) => {
      latestUserId = userId;
      const profile = await applyOnlineProfile(userId);
      if (profile) return;

      const cachedProfile = await getCachedAuthUserById(userId);
      if (cachedProfile && active && latestUserId === userId) {
        applyAuth({
          user: cachedProfile,
          authenticated: true,
          authMode: "offline",
        });
      }
    };

    const start = async () => {
      const deadline = Date.now() + STARTUP_BUDGET_MS;

      try {
        // Wipe stale local data first if the server was reset, then restore
        // the session (which may have just been cleared).
        await reconcileLocalDataWithServer();

        // While offline with an expired token the auth client retries the
        // refresh for ~30 s before answering. Don't keep the splash up that
        // long: continue without a session and pick it up if it arrives.
        const sessionPromise = supabase.auth
          .getSession()
          .then(({ data }) => data.session?.user?.id ?? null);
        const userId = await withTimeout(
          sessionPromise,
          Math.max(deadline - Date.now(), MIN_SESSION_WAIT_MS),
          SESSION_PENDING
        );

        if (userId === SESSION_PENDING) {
          sessionPromise
            .then((lateUserId) => {
              if (lateUserId && active && !authRef.current.authenticated) {
                return restoreSession(lateUserId);
              }
            })
            .catch(() => {});
          return;
        }

        if (userId) await restoreSession(userId);
      } catch (error) {
        console.log("[auth] Session restore failed:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    start();

    // IMPORTANT: this callback runs while the auth client holds its internal
    // lock. Awaiting any Supabase call here (even a plain query, which needs
    // the session) deadlocks the client: every later request hangs forever.
    // So it stays synchronous and defers the real work with setTimeout.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // The initial session is restored by start() above.
      if (event === "INITIAL_SESSION") return;

      const userId = session?.user?.id ?? null;

      if (!userId) {
        latestUserId = null;
        applyAuth(signedOutAuth);
        return;
      }

      // A background refresh must not sign a user back in after they logged
      // out while offline (the client keeps that session in memory).
      if (event === "TOKEN_REFRESHED" && !authRef.current.authenticated) {
        return;
      }

      latestUserId = userId;
      setTimeout(() => {
        applyOnlineProfile(userId).catch((error) => {
          console.log("[auth] Profile refresh failed:", error);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = (user: User, mode: "online" | "offline" = "online") => {
    cacheAuthUser(user, mode === "online").catch((error) => {
      console.log("[auth] Caching the signed-in user failed:", error);
    });
    const next: AuthData = { user, authenticated: true, authMode: mode };
    authRef.current = next;
    setAuthData(next);
  };

  const offlineLogin = async (email: string, password: string) => {
    const cachedUser = await verifyOfflineCredential(email, password);
    if (!cachedUser) return false;

    login(cachedUser, "offline");
    return true;
  };

  const logout = () => {
    authRef.current = signedOutAuth;
    setAuthData(signedOutAuth);
  };

  if (loading) return null; // Or a splash screen

  return (
    <AuthContext.Provider value={{ ...authData, login, offlineLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    avatar: data.avatar || "",
    email_visibility: data.email_visibility,
    verified: data.verified,
    created_at: data.created_at,
    updated_at: data.updated_at,
    location: data.location || undefined,
  };
}

async function cacheProfileDetailsBestEffort(user: User) {
  try {
    await getProfileByUser(user);
  } catch (error) {
    console.log("Profile details cache failed:", error);
  }
}

export const useAuthCtx = () => {
  return useContext(AuthContext);
};
