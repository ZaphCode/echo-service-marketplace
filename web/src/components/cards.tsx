import { Link } from "react-router";
import type { ContractingWithOwner, Coords, ServiceRequestWithRelations, ServiceWithProvider } from "../api/models";
import { counterpart, requestSubject } from "../api/requests";
import { formatPrice, formatRelativeDate } from "../utils/format";
import { distanceKm, formatDistance, toCoords } from "../utils/geo";
import { displayState } from "../utils/negotiation";
import Icon from "./Icon";
import { Avatar, Photo, RatingChip, StatePill } from "./ui";
import "./cards.css";

const CATEGORY_PHOTOS: Record<string, string> = {
  todas: "1625241152315-4a698f74ceb7",
  plomeria: "1567769462911-520a38352744",
  electricista: "1758101755915-462eddc23f57",
  carpinteria: "1659930087003-2d64e33181f7",
  pintura: "1562259949-e8e7689d7828",
  jardineria: "1689728318937-17d24bc0a65c",
  "instalacion de aires acondicionados": "1757219525975-03b5984bc6e8",
  "instalacion de pisos": "1523413363574-c30aa1c2a516",
  "limpieza de banos": "1661107259637-4e1c55462428",
  albanileria: "1701850009190-2859ba2aeea6",
  "limpieza de casas y oficinas": "1713110824336-f78c320dcf8e",
  "limpieza de fosas y biodigestores": "1662445407335-db6b4e68c323",
};

/** Misma foto por categoría que la app móvil (src/theme/categoryImages.ts). */
export function categoryPhoto(name: string) {
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const id = CATEGORY_PHOTOS[key];
  return id ? `https://images.unsplash.com/photo-${id}?w=240&h=320&fit=crop&q=60&fm=webp` : undefined;
}

export function ServiceCard({
  service,
  userId,
  origin,
  rating,
  categoryName,
  eager,
}: {
  service: ServiceWithProvider;
  userId: string;
  origin: Coords | null;
  rating?: { average: number; count: number };
  categoryName?: string;
  eager?: boolean;
}) {
  const mine = service.provider === userId;
  const distance = mine ? null : distanceKm(origin, service.provider_profile?.location ?? null);
  return (
    <article className="feed-card">
      <Link to={`/servicio/${service.id}`} className="feed-link" aria-label={service.name} />
      <div className="feed-head">
        <Avatar user={service.provider_profile} size={36} />
        <div className="feed-who">
          <strong>{mine ? "Tú" : service.provider_profile?.name}</strong>
          <span className="subtle">
            {categoryName ? `${categoryName} · ` : ""}
            {formatRelativeDate(service.created_at)}
          </span>
        </div>
        {mine ? <span className="pill" data-tone="accent">Tuyo</span> : rating ? <RatingChip {...rating} /> : null}
      </div>
      <Photo path={service.photos?.[0]} alt="" className="feed-photo" eager={eager} />
      <div className="feed-body">
        <div className="feed-title-row">
          <h3>{service.name}</h3>
          {distance !== null ? (
            <span className="distance">
              <Icon name="pin" size={13} /> {formatDistance(distance)}
            </span>
          ) : null}
        </div>
        <div className="feed-foot">
          <span className="muted">
            Desde <strong className="price">{formatPrice(service.base_price)}</strong>
          </span>
          {!mine ? <span className="btn btn-primary btn-sm">Solicitar</span> : null}
        </div>
      </div>
    </article>
  );
}

export function ContractingCard({ contracting, userId, origin, categoryName }: { contracting: ContractingWithOwner; userId: string; origin: Coords | null; categoryName?: string }) {
  const mine = contracting.owner === userId;
  const distance = mine ? null : distanceKm(origin, toCoords(contracting.lat, contracting.lon));
  return (
    <article className="feed-card">
      <Link to={`/contratacion/${contracting.id}`} className="feed-link" aria-label={contracting.name} />
      <div className="feed-head">
        <Avatar user={contracting.owner_profile} size={36} />
        <div className="feed-who">
          <strong>{mine ? "Tú" : contracting.owner_profile?.name}</strong>
          <span className="subtle">
            Busca profesional · {categoryName ? `${categoryName} · ` : ""}
            {formatRelativeDate(contracting.created_at)}
          </span>
        </div>
        <span className="pill" data-tone={contracting.is_closed ? "done" : "success"}>
          {contracting.is_closed ? "Completada" : "Abierta"}
        </span>
      </div>
      <div className="feed-body">
        <h3>{contracting.name}</h3>
        <p className="muted clamp-2">{contracting.description}</p>
        {contracting.photos?.length ? (
          <div className="feed-thumbs">
            {contracting.photos.slice(0, 2).map((photo) => (
              <Photo key={photo} path={photo} alt="" className="feed-thumb" />
            ))}
          </div>
        ) : null}
        <div className="feed-foot">
          <span className="muted">
            Presupuesto <strong className="price">{formatPrice(contracting.base_price)}</strong>
          </span>
          {distance !== null ? (
            <span className="distance">
              <Icon name="pin" size={13} /> {formatDistance(distance)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function RequestRow({ request, userId, unread }: { request: ServiceRequestWithRelations; userId: string; unread: number }) {
  const subject = requestSubject(request);
  const other = counterpart(request, userId);
  return (
    <Link to={`/chat/${request.id}`} className="request-row">
      <Photo path={subject.photos[0]} alt="" className="request-photo" />
      <div className="request-main">
        <div className="request-top">
          <strong className="ellipsis">{subject.name}</strong>
          <span className="subtle nowrap">{formatRelativeDate(request.updated_at ?? request.requested)}</span>
        </div>
        <span className="muted ellipsis">
          {subject.type === "service" ? "Servicio" : "Contratación"} · con {other?.name ?? "—"}
        </span>
        <div className="request-bottom">
          <StatePill state={displayState(request)} />
          <span className="request-price">
            {unread > 0 ? <span className="unread" aria-label={`${unread} mensajes nuevos`}>{unread}</span> : null}
            {formatPrice(request.agreed_price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
