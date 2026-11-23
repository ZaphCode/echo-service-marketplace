import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getServiceRatings, searchServices } from "../api/catalog";
import { useSignedInUser } from "../auth/AuthContext";
import { useUserLocation } from "../hooks/useLocation";
import { ServiceCard } from "../components/cards";
import { BackHeader, EmptyState, ErrorState, Skeletons } from "../components/ui";
import Icon from "../components/Icon";
import "./home.css";

export default function Search() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  const location = useUserLocation();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);

  const results = useQuery({ queryKey: ["search", q], queryFn: () => searchServices(q), enabled: q.length > 0 });
  const ids = (results.data ?? []).map((service) => service.id);
  const ratings = useQuery({ queryKey: ["ratings", ids.join(",")], queryFn: () => getServiceRatings(ids), enabled: ids.length > 0 });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) setParams({ q: text.trim() });
  }

  return (
    <div className="page">
      <BackHeader title="Buscar" onBack={() => navigate(-1)} />
      <form className="search" role="search" onSubmit={submit}>
        <Icon name="search" size={18} />
        <input className="search-input" type="search" autoFocus aria-label="Buscar servicios" value={text} onChange={(e) => setText(e.target.value)} placeholder="Plomería, pintura, minisplit…" />
      </form>
      {!q ? null : results.isPending ? (
        <Skeletons count={2} height={260} />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState icon="search" title={`Sin resultados para «${q}»`}>
          Prueba con otra palabra o publica una contratación con lo que necesitas.
        </EmptyState>
      ) : (
        <div className="feed">
          {results.data.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              userId={user.id}
              origin={location.coords}
              rating={ratings.data?.[service.id]}
              categoryName={service.category_detail?.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
