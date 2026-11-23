import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getService, listServiceReviews } from "../api/catalog";
import { findRequestForService } from "../api/requests";
import { useSignedInUser } from "../auth/AuthContext";
import { useCreateRequest } from "../hooks/useCreateRequest";
import { useUserLocation } from "../hooks/useLocation";
import { shareLink } from "../pwa/device";
import { useToast } from "../components/Layout";
import Icon from "../components/Icon";
import RequestForm from "../components/RequestForm";
import Sheet from "../components/Sheet";
import { Avatar, BackHeader, ErrorState, Photo, Skeletons, Stars } from "../components/ui";
import { formatPrice, formatRelativeDate } from "../utils/format";
import { distanceKm, formatDistance } from "../utils/geo";
import "./detail.css";

export default function ServiceOverview() {
  const { id = "" } = useParams();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useUserLocation();
  const [requesting, setRequesting] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { create, busy } = useCreateRequest(user);

  const service = useQuery({ queryKey: ["service", id], queryFn: () => getService(id) });
  const reviews = useQuery({ queryKey: ["reviews", "service", id], queryFn: () => listServiceReviews(id) });
  const existing = useQuery({ queryKey: ["requests", "service", id, user.id], queryFn: () => findRequestForService(id, user.id) });

  if (service.isPending) return <div className="page"><Skeletons count={3} height={220} /></div>;
  if (service.isError) return <div className="page"><ErrorState error={service.error} onRetry={() => void service.refetch()} /></div>;

  const data = service.data;
  const mine = data.provider === user.id;
  const photos = data.photos?.length ? data.photos : [null];
  const ratings = reviews.data ?? [];
  const average = ratings.length ? ratings.reduce((sum, review) => sum + Number(review.rating), 0) / ratings.length : 0;
  const distance = mine ? null : distanceKm(location.coords, data.provider_profile?.location ?? null);

  async function share() {
    const result = await shareLink({
      title: data.name,
      text: `${data.name} con ${data.provider_profile?.name} en Echo, desde ${formatPrice(data.base_price)}.`,
      url: `${window.location.origin}${import.meta.env.BASE_URL}#/servicio/${data.id}`,
    });
    if (result === "copied") toast("Enlace copiado al portapapeles.", "success");
    if (result === "failed") toast("No se pudo compartir el enlace.", "danger");
  }

  return (
    <div className="page detail">
      <BackHeader
        onBack={() => navigate(-1)}
        actions={
          <button className="icon-btn" type="button" onClick={share} aria-label="Compartir servicio">
            <Icon name="share" size={18} />
          </button>
        }
      />

      <div className="gallery">
        <Photo path={photos[photoIndex]} alt={data.name} className="gallery-photo" eager />
        {photos.length > 1 ? (
          <div className="gallery-dots">
            {photos.map((_, index) => (
              <button key={index} type="button" aria-label={`Foto ${index + 1}`} aria-pressed={index === photoIndex} onClick={() => setPhotoIndex(index)} />
            ))}
          </div>
        ) : null}
      </div>

      <section className="section">
        <div className="tags">
          {data.category_detail ? <span className="pill" data-tone="accent">{data.category_detail.name}</span> : null}
          {distance !== null ? <span className="pill">{formatDistance(distance)}</span> : null}
        </div>
        <h1>{data.name}</h1>
        <p className="subtle">Publicado {formatRelativeDate(data.created_at).toLowerCase()}</p>
      </section>

      <Link to={mine ? "/perfil" : `/usuario/${data.provider}`} className="person-row">
        <Avatar user={data.provider_profile} size={48} />
        <div>
          <strong>{mine ? "Tú" : data.provider_profile?.name}</strong>
          <span className="subtle">Profesional{data.provider_profile?.verified ? " verificado" : ""}</span>
        </div>
        <Icon name="back" size={18} />
      </Link>

      <section className="section">
        <h2>Descripción</h2>
        <p className="muted pre-line">{data.description || "Sin descripción."}</p>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Reseñas</h2>
          {ratings.length ? (
            <span className="rating-summary">
              <Stars value={average} /> <strong>{average.toFixed(1)}</strong> <span className="subtle">({ratings.length})</span>
            </span>
          ) : null}
        </div>
        {ratings.length === 0 ? (
          <p className="muted">Todavía no hay reseñas para este servicio.</p>
        ) : (
          <ul className="list reviews">
            {ratings.map((review) => (
              <li key={review.id} className="review">
                <Avatar user={review.reviewer_profile} size={36} />
                <div>
                  <div className="review-top">
                    <strong>{review.reviewer_profile?.name}</strong>
                    <span className="subtle">{formatRelativeDate(review.created_at)}</span>
                  </div>
                  <Stars value={Number(review.rating)} size={12} />
                  {review.comment ? <p className="muted">{review.comment}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="cta-bar">
        <div>
          <span className="subtle">Precio base</span>
          <strong className="cta-price">{formatPrice(data.base_price)}</strong>
        </div>
        {mine ? (
          <Link className="btn btn-ghost" to={`/servicio/${data.id}/editar`}>
            <Icon name="edit" size={16} /> Editar servicio
          </Link>
        ) : existing.data ? (
          <Link className="btn btn-primary" to={`/chat/${existing.data}`}>
            Ir al chat
          </Link>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => setRequesting(true)}>
            Solicitar
          </button>
        )}
      </footer>

      <Sheet open={requesting} title="Solicitar servicio" onClose={() => setRequesting(false)}>
        <p className="muted">
          Propón un precio y una fecha. {data.provider_profile?.name} podrá aceptar o enviarte una contrapropuesta en el chat.
        </p>
        <RequestForm
          mode="request"
          defaultPrice={Number(data.base_price)}
          submitLabel="Enviar solicitud"
          busy={busy}
          onSubmit={(values) =>
            void create({ type: "service", id: data.id, name: data.name, providerId: data.provider }, values).then(() => setRequesting(false))
          }
        />
      </Sheet>
    </div>
  );
}
