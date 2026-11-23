import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { PwaProvider } from "./pwa/PwaContext";
import { LocationProvider } from "./hooks/useLocation";
import Layout, { ToastProvider } from "./components/Layout";
import { Skeletons } from "./components/ui";
import Home from "./screens/Home";

// Las pantallas se cargan bajo demanda (code splitting): el primer arranque descarga menos JS.
const SignIn = lazy(() => import("./screens/SignIn"));
const SignUp = lazy(() => import("./screens/SignUp"));
const Search = lazy(() => import("./screens/Search"));
const ServiceOverview = lazy(() => import("./screens/ServiceOverview"));
const ContractingOverview = lazy(() => import("./screens/ContractingOverview"));
const Requests = lazy(() => import("./screens/Requests"));
const Chatroom = lazy(() => import("./screens/Chatroom"));
const Notifications = lazy(() => import("./screens/Notifications"));
const MyProfile = lazy(() => import("./screens/MyProfile"));
const UserProfile = lazy(() => import("./screens/UserProfile"));
const Publish = lazy(() => import("./screens/Publish"));
const ServiceEditor = lazy(() => import("./screens/ServiceEditor"));
const ContractingEditor = lazy(() => import("./screens/ContractingEditor"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // offlineFirst: la petición sale aunque el navegador diga «sin conexión», y el Service Worker
      // responde con la copia guardada.
      networkMode: "offlineFirst",
      staleTime: 30_000,
      retry: (failures) => navigator.onLine && failures < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

function Loading() {
  return (
    <div className="page">
      <Skeletons count={4} />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading />;
  if (status === "signed-out") return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  if (status === "signed-in") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const navigate = useNavigate();
  const onNavigate = useCallback((hash: string) => navigate(hash.replace(/^#/, "") || "/"), [navigate]);
  return (
    <PwaProvider onNavigate={onNavigate}>
      <LocationProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/entrar" element={<PublicOnly><SignIn /></PublicOnly>} />
            <Route path="/registro" element={<PublicOnly><SignUp /></PublicOnly>} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="buscar" element={<Search />} />
              <Route path="servicio/nuevo" element={<ServiceEditor />} />
              <Route path="servicio/:id/editar" element={<ServiceEditor />} />
              <Route path="servicio/:id" element={<ServiceOverview />} />
              <Route path="contratacion/nueva" element={<ContractingEditor />} />
              <Route path="contratacion/:id/editar" element={<ContractingEditor />} />
              <Route path="contratacion/:id" element={<ContractingOverview />} />
              <Route path="solicitudes" element={<Requests />} />
              <Route path="chat/:id" element={<Chatroom />} />
              <Route path="notificaciones" element={<Notifications />} />
              <Route path="perfil" element={<MyProfile />} />
              <Route path="usuario/:id" element={<UserProfile />} />
              <Route path="publicar" element={<Publish />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </LocationProvider>
    </PwaProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
