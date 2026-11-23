import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getServiceRatings, listCategories, listContractingsNearby, listServicesNearby } from "../api/catalog";
import { useSignedInUser } from "../auth/AuthContext";
import { useUserLocation } from "../hooks/useLocation";
import { usePwa } from "../pwa/PwaContext";
import { categoryPhoto, ContractingCard, ServiceCard } from "../components/cards";
import { EmptyState, ErrorState, Logo, Skeletons } from "../components/ui";
import Icon from "../components/Icon";
import { firstName } from "../utils/format";
import "./home.css";

type Tab = "services" | "contractings";

export default function Home() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const { online } = usePwa();
  const location = useUserLocation();
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState<Tab>("services");
  const [search, setSearch] = useState("");

  // Las coordenadas se redondean en la llave: moverse unos metros no vuelve a pedir la lista.
  const coordsKey = location.coords ? `${location.coords.lat.toFixed(2)},${location.coords.lon.toFixed(2)}` : "none";
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });
  const services = useQuery({
    queryKey: ["services", category, coordsKey],
    queryFn: () => listServicesNearby(category, location.coords),
  });
  const contractings = useQuery({
    queryKey: ["contractings", category, coordsKey, user.id],
    queryFn: () => listContractingsNearby(category, user.id, location.coords),
  });
  const serviceIds = (services.data ?? []).map((service) => service.id);
  const ratings = useQuery({
    queryKey: ["ratings", serviceIds.join(",")],
    queryFn: () => getServiceRatings(serviceIds),
    enabled: serviceIds.length > 0,
  });

  const categoryName = (id: string) => categories.data?.find((item) => item.id === id)?.name;
  const active = tab === "services" ? services : contractings;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (search.trim()) navigate(`/buscar?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="page">
      <header className="home-header">
        <Logo width={96} />
        <span className={`sync-indicator ${online ? "" : "offline"}`} title={online ? "Conectado" : "Sin conexión"}>
          <Icon name={online ? "cloud" : "cloud-off"} size={18} />
        </span>
      </header>

      <section className="page-header">
        <h1>Hola, {firstName(user.name)}</h1>
        <p className="muted">¿Qué necesitas resolver hoy?</p>
      </section>

      <form className="search" role="search" onSubmit={submitSearch}>
        <Icon name="search" size={18} />
        <input
          className="search-input"
          type="search"
          placeholder="Buscar plomería, pintura…"
          aria-label="Buscar servicios"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </form>

      {location.source !== "device" ? (
        <div className="location-hint">
          <Icon name="navigation" size={18} />
          <p>
            {location.error ?? "Activa tu ubicación para ver primero lo más cercano."}
          </p>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => void location.locate()} disabled={location.locating}>
            {location.locating ? "Ubicando…" : "Activar"}
          </button>
        </div>
      ) : null}

      <section className="section" aria-labelledby="categorias">
        <h2 id="categorias">Categorías</h2>
        <div className="categories" role="group" aria-label="Filtrar por categoría">
          {[{ id: "all", name: "Todas" }, ...(categories.data ?? [])].map((item) => {
            const photo = item.id === "all" ? undefined : categoryPhoto(item.name);
            return (
              <button
                key={item.id}
                type="button"
                className="category"
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {photo ? <img src={photo} alt="" loading="lazy" width={120} height={160} /> : <Icon name="grid" size={26} />}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="segmented" role="tablist" aria-label="Tipo de publicación">
          <button role="tab" type="button" aria-selected={tab === "services"} onClick={() => setTab("services")}>
            Servicios <span className="count">{services.data?.length ?? "–"}</span>
          </button>
          <button role="tab" type="button" aria-selected={tab === "contractings"} onClick={() => setTab("contractings")}>
            Contrataciones <span className="count">{contractings.data?.length ?? "–"}</span>
          </button>
        </div>

        {active.isPending ? (
          <Skeletons count={3} height={280} />
        ) : active.isError ? (
          <ErrorState error={active.error} onRetry={() => void active.refetch()} />
        ) : tab === "services" ? (
          services.data!.length === 0 ? (
            <EmptyState icon="briefcase" title="Aún no hay servicios en esta categoría">
              Prueba con otra categoría o publica el tuyo.
            </EmptyState>
          ) : (
            <div className="feed">
              {services.data!.map((service, index) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  userId={user.id}
                  origin={location.coords}
                  rating={ratings.data?.[service.id]}
                  categoryName={categoryName(service.category)}
                  eager={index === 0}
                />
              ))}
            </div>
          )
        ) : contractings.data!.length === 0 ? (
          <EmptyState
            icon="user-plus"
            title="No hay contrataciones abiertas"
            action={
              <Link className="btn btn-primary btn-sm" to="/contratacion/nueva">
                Publicar lo que necesito
              </Link>
            }
          >
            Publica lo que necesitas y los profesionales te mandarán su cotización.
          </EmptyState>
        ) : (
          <div className="feed">
            {contractings.data!.map((contracting) => (
              <ContractingCard
                key={contracting.id}
                contracting={contracting}
                userId={user.id}
                origin={location.coords}
                categoryName={categoryName(contracting.category)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
