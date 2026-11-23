import { useEffect, useState } from "react";
import type { AgreementState } from "../api/models";
import { useSignedInUser } from "../auth/AuthContext";
import { useActivity } from "../hooks/useActivity";
import { listOutbox, onOutboxChange } from "../pwa/outbox";
import type { OutboxItem } from "../pwa/db";
import { RequestRow } from "../components/cards";
import { EmptyState, ErrorState, Skeletons } from "../components/ui";
import Icon from "../components/Icon";
import { displayState, STATE_LABELS } from "../utils/negotiation";
import { formatPrice } from "../utils/format";
import "../components/cards.css";
import "./requests.css";

const FILTERS: ("ALL" | AgreementState)[] = ["ALL", "NEGOTIATION", "ACCEPTED", "CANCELED", "FINISHED"];

export default function Requests() {
  const user = useSignedInUser();
  const { requests, unreadByRequest } = useActivity(user.id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [pending, setPending] = useState<OutboxItem[]>([]);

  // Solicitudes creadas sin conexión que siguen en la cola de Background Sync.
  useEffect(() => {
    const load = () => void listOutbox().then((items) => setPending(items.filter((item) => item.kind === "request")));
    load();
    return onOutboxChange(load);
  }, []);

  const list = (requests.data ?? []).filter((request) => filter === "ALL" || displayState(request) === filter);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Solicitudes</h1>
        <p className="muted">Tus negociaciones activas y pasadas</p>
      </header>

      <div className="chips" role="tablist" aria-label="Filtrar por estado">
        {FILTERS.map((value) => (
          <button key={value} role="tab" type="button" className="chip" aria-selected={filter === value} onClick={() => setFilter(value)}>
            {value === "ALL" ? "Todas" : STATE_LABELS[value]}
          </button>
        ))}
      </div>

      {pending.length ? (
        <ul className="list outbox-list">
          {pending.map((item) =>
            item.kind === "request" ? (
              <li key={item.id} className="outbox-item">
                <Icon name="clock" size={18} />
                <div>
                  <strong>{item.payload.subjectName}</strong>
                  <span className="subtle">
                    {formatPrice(Number(item.payload.request.agreed_price))} · se enviará al reconectar
                  </span>
                </div>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      {requests.isPending ? (
        <Skeletons count={4} height={110} />
      ) : requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="chat" title={filter === "ALL" ? "Aún no tienes solicitudes" : "Nada en este estado"}>
          {filter === "ALL" ? "Cuando solicites un servicio o apliques a una contratación, la negociación aparecerá aquí." : null}
        </EmptyState>
      ) : (
        <div className="request-list">
          {list.map((request) => (
            <RequestRow key={request.id} request={request} userId={user.id} unread={unreadByRequest[request.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
