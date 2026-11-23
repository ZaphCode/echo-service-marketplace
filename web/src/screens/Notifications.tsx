import { useEffect } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markNotificationsRead } from "../api/requests";
import type { Notification } from "../api/models";
import { useSignedInUser } from "../auth/AuthContext";
import { queryKeys } from "../hooks/useActivity";
import { EmptyState, ErrorState, Skeletons } from "../components/ui";
import Icon from "../components/Icon";
import { boldSegments, formatRelativeDate } from "../utils/format";
import PushToggle from "../components/PushToggle";
import "./notifications.css";

const ICONS: Record<string, [string, string]> = {
  "PROVIDER:NEW_REQUEST": ["user-plus", "accent"],
  "PROVIDER:NEW_APPLICATION": ["briefcase", "accent"],
  "CLIENT:NEW_OFFER": ["tag", "warn"],
  "PROVIDER:NEW_OFFER": ["tag", "success"],
  "SYSTEM:INFO": ["bell", "done"],
};

function group(items: Notification[]) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups: [string, Notification[]][] = [
    ["Hoy", []],
    ["Esta semana", []],
    ["Anteriores", []],
  ];
  for (const item of items) {
    const time = new Date(item.created_at).getTime();
    groups[time >= startOfToday ? 0 : now - time <= 6 * day ? 1 : 2][1].push(item);
  }
  return groups.filter(([, list]) => list.length > 0);
}

export default function Notifications() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: queryKeys.notifications(user.id), queryFn: () => listNotifications(user.id) });

  // Abrir la pantalla las marca como leídas (igual que la app) y limpia el número del ícono.
  useEffect(() => {
    const unread = (notifications.data ?? []).filter((item) => !item.read).map((item) => item.id);
    if (unread.length === 0) return;
    void markNotificationsRead(unread).then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
  }, [notifications.data, queryClient]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Avisos</h1>
        <p className="muted">Solicitudes, propuestas y valoraciones</p>
      </header>

      <PushToggle compact />

      {notifications.isPending ? (
        <Skeletons count={5} height={72} />
      ) : notifications.isError ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.data.length === 0 ? (
        <EmptyState icon="bell" title="Sin avisos por ahora">
          Aquí verás cuando alguien te solicite un servicio, te haga una propuesta o te valore.
        </EmptyState>
      ) : (
        group(notifications.data as Notification[]).map(([title, items]) => (
          <section key={title} className="section">
            <h2 className="group-title">{title}</h2>
            <ul className="list notification-list">
              {items.map((item) => {
                const [icon, tone] = ICONS[item.type] ?? ICONS["SYSTEM:INFO"];
                const content = (
                  <>
                    <span className="notification-icon" data-tone={tone}>
                      <Icon name={icon} size={18} />
                    </span>
                    <div>
                      <p>
                        {boldSegments(item.message).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>))}
                      </p>
                      <span className="subtle">{formatRelativeDate(item.created_at)}</span>
                    </div>
                    {!item.read ? <span className="unread-dot" aria-label="Nuevo" /> : null}
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.request ? (
                      <Link className="notification" to={`/chat/${item.request}`}>
                        {content}
                      </Link>
                    ) : (
                      <div className="notification">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
