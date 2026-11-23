import { useQuery } from "@tanstack/react-query";
import { countFinishedJobs, listReviewsForUser } from "../api/requests";
import { DAYS, getProfileDetails, normalizeDays } from "../api/profiles";
import type { ProfileDetails, User } from "../api/models";
import { Avatar, Stars } from "./ui";
import { formatRelativeDate } from "../utils/format";
import "./ProfileView.css";

export function useProfileData(user: Pick<User, "id" | "role">) {
  const details = useQuery({ queryKey: ["profile-details", user.id], queryFn: () => getProfileDetails(user) });
  const reviews = useQuery({ queryKey: ["reviews", "user", user.id], queryFn: () => listReviewsForUser(user.id) });
  const jobs = useQuery({ queryKey: ["jobs", user.id], queryFn: () => countFinishedJobs(user.id) });
  return { details, reviews, jobs };
}

export function ProfileHeader({ user, data, avatarAction }: { user: User; data: ReturnType<typeof useProfileData>; avatarAction?: React.ReactNode }) {
  const reviews = data.reviews.data ?? [];
  const average = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : 0;
  return (
    <section className="profile-header">
      <div className="profile-avatar">
        <Avatar user={user} size={92} />
        {avatarAction}
      </div>
      <h1>{user.name}</h1>
      <span className="pill" data-tone={user.role === "provider" ? "accent" : "done"}>
        {user.role === "provider" ? "Profesional" : "Cliente"}
      </span>
      <dl className="stats">
        <div>
          <dt>Reseñas</dt>
          <dd>{reviews.length}</dd>
        </div>
        <div>
          <dt>Trabajos</dt>
          <dd>{data.jobs.data ?? "–"}</dd>
        </div>
        <div>
          <dt>Calificación</dt>
          <dd>{average ? average.toFixed(1) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ProfessionalInfo({ details }: { details: ProfileDetails | null | undefined }) {
  if (!details || !("specialty" in details)) return null;
  const days = normalizeDays(details.available_days);
  return (
    <section className="section">
      <h2>Información profesional</h2>
      <div className="panel info-grid">
        <div>
          <span className="subtle">Especialidad</span>
          <strong>{details.specialty_category?.name ?? "—"}</strong>
        </div>
        <div>
          <span className="subtle">Experiencia</span>
          <strong>
            {Number(details.experience_years)} año{Number(details.experience_years) === 1 ? "" : "s"}
          </strong>
        </div>
        {details.description ? (
          <div className="span-2">
            <span className="subtle">Descripción</span>
            <p>{details.description}</p>
          </div>
        ) : null}
        <div className="span-2">
          <span className="subtle">Días disponibles</span>
          <div className="day-chips">
            {DAYS.map(([code, label]) => (
              <span key={code} className={days.includes(code) ? "on" : ""}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReviewList({ data }: { data: ReturnType<typeof useProfileData> }) {
  const reviews = data.reviews.data ?? [];
  if (reviews.length === 0) return null;
  return (
    <section className="section">
      <h2>Lo que dicen</h2>
      <ul className="list panel review-panel">
        {reviews.slice(0, 6).map((review) => (
          <li key={review.id} className="review">
            <Avatar user={review.reviewer_profile} size={34} />
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
    </section>
  );
}
