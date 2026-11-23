import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getContracting, listCategories } from "../api/catalog";
import { findApplication } from "../api/requests";
import { useSignedInUser } from "../auth/AuthContext";
import { useCreateRequest } from "../hooks/useCreateRequest";
import { useUserLocation } from "../hooks/useLocation";
import { shareLink } from "../pwa/device";
import { useToast } from "../components/Layout";
import Icon from "../components/Icon";
import RequestForm from "../components/RequestForm";
import Sheet from "../components/Sheet";
import { Avatar, BackHeader, ErrorState, Photo, Skeletons } from "../components/ui";
import { formatPrice, formatRelativeDate } from "../utils/format";
import { distanceKm, formatDistance, toCoords } from "../utils/geo";
import "../components/cards.css";
import "./detail.css";

export default function ContractingOverview() {
  const { id = "" } = useParams();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useUserLocation();
  const [applying, setApplying] = useState(false);
  const { create, busy } = useCreateRequest(user);

  const contracting = useQuery({ queryKey: ["contracting", id], queryFn: () => getContracting(id) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });
  const application = useQuery({
    queryKey: ["requests", "contracting", id, user.id],
    queryFn: () => findApplication(id, user.id),
    enabled: user.role === "provider",
  });

  if (contracting.isPending) return <div className="page"><Skeletons count={3} height={200} /></div>;
  if (contracting.isError) return <div className="page"><ErrorState error={contracting.error} onRetry={() => void contracting.refetch()} /></div>;

  const data = contracting.data;
  const mine = data.owner === user.id;
  const distance = mine ? null : distanceKm(location.coords, toCoords(data.lat, data.lon));
  const category = categories.data?.find((item) => item.id === data.category)?.name;

  async function share() {
    const result = await shareLink({
      title: data.name,
      text: `${data.owner_profile?.name} busca profesional en Echo: ${data.name}. Presupuesto ${formatPrice(data.base_price)}.`,
      url: `${window.location.origin}${import.meta.env.BASE_URL}#/contratacion/${data.id}`,
    });
    if (result === "copied") toast("Enlace copiado al portapapeles.", "success");
  }

  let cta;
  if (data.is_closed) cta = <button className="btn" type="button" disabled>Contratación completada</button>;
  else if (mine) cta = <Link className="btn btn-ghost" to={`/contratacion/${data.id}/editar`}><Icon name="edit" size={16} /> Editar</Link>;
  else if (application.data) cta = <Link className="btn btn-primary" to={`/chat/${application.data}`}>Ir al chat</Link>;
  else if (user.role === "provider") cta = <button className="btn btn-primary" type="button" onClick={() => setApplying(true)}>Aplicar</button>;
  else cta = <button className="btn" type="button" disabled>Solo profesionales</button>;

  return (
    <div className="page detail">
      <BackHeader
        onBack={() => navigate(-1)}
        actions={
          <button className="icon-btn" type="button" onClick={share} aria-label="Compartir contratación">
            <Icon name="share" size={18} />
          </button>
        }
      />

      {data.photos?.length ? (
        <div className="gallery">
          <Photo path={data.photos[0]} alt={data.name} className="gallery-photo" eager />
        </div>
      ) : null}

      <section className="section">
        <div className="tags">
          <span className="pill" data-tone={data.is_closed ? "done" : "success"}>{data.is_closed ? "Completada" : "Abierta"}</span>
          {category ? <span className="pill" data-tone="accent">{category}</span> : null}
          {distance !== null ? <span className="pill">{formatDistance(distance)}</span> : null}
        </div>
        <h1>{data.name}</h1>
        <p className="subtle">Publicada {formatRelativeDate(data.created_at).toLowerCase()}</p>
      </section>

      <Link to={mine ? "/perfil" : `/usuario/${data.owner}`} className="person-row">
        <Avatar user={data.owner_profile} size={48} />
        <div>
          <strong>{mine ? "Tú" : data.owner_profile?.name}</strong>
          <span className="subtle">Busca profesional</span>
        </div>
        <Icon name="back" size={18} />
      </Link>

      <section className="section">
        <h2>Lo que necesita</h2>
        <p className="muted pre-line">{data.description}</p>
        {data.lat != null ? (
          <p className="subtle">
            <Icon name="pin" size={14} /> Zona aproximada; la ubicación exacta solo la ve quien publicó.
          </p>
        ) : null}
      </section>

      {data.photos?.length > 1 ? (
        <div className="feed-thumbs">
          {data.photos.slice(1).map((photo) => (
            <Photo key={photo} path={photo} alt="" className="feed-thumb" />
          ))}
        </div>
      ) : null}

      <footer className="cta-bar">
        <div>
          <span className="subtle">Presupuesto</span>
          <strong className="cta-price">{formatPrice(data.base_price)}</strong>
        </div>
        {cta}
      </footer>

      <Sheet open={applying} title="Aplicar a la contratación" onClose={() => setApplying(false)}>
        <p className="muted">Envía tu cotización. {data.owner_profile?.name} podrá aceptarla o negociar contigo en el chat.</p>
        <RequestForm
          mode="request"
          defaultPrice={Number(data.base_price)}
          submitLabel="Enviar cotización"
          busy={busy}
          onSubmit={(values) =>
            void create({ type: "contracting", id: data.id, name: data.name, ownerId: data.owner }, values).then(() => setApplying(false))
          }
        />
      </Sheet>
    </div>
  );
}
