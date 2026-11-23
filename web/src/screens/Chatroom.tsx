import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isNetworkError } from "../lib/supabase";
import {
  counterpart,
  createNotification,
  createReview,
  finalizeRequestCompletion,
  getRequest,
  hasReviewed,
  listMessages,
  newMessageClientId,
  requestSubject,
  updateRequest,
  upsertMessage,
} from "../api/requests";
import type { Message, ServiceRequestWithRelations } from "../api/models";
import { useSignedInUser } from "../auth/AuthContext";
import { markChatRead } from "../hooks/useActivity";
import { enqueueMessage, listOutbox, onOutboxChange } from "../pwa/outbox";
import { useToast } from "../components/Layout";
import Icon from "../components/Icon";
import RequestForm, { type RequestFormValues } from "../components/RequestForm";
import Sheet from "../components/Sheet";
import { Avatar, BackHeader, ErrorState, Skeletons, StatePill } from "../components/ui";
import { firstName, formatDay, formatPrice, formatTime } from "../utils/format";
import {
  acceptPatch,
  completePatch,
  displayState,
  negotiationButtons,
  offerChanged,
  offerPatch,
  partyLabel,
  rejectPatch,
} from "../utils/negotiation";
import "./chat.css";

type ChatMessage = Message & { pending?: boolean };

export default function Chatroom() {
  const { id = "" } = useParams();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [present, setPresent] = useState<string[]>([]);
  const [queued, setQueued] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<"offer" | "review" | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const request = useQuery({ queryKey: ["request", id], queryFn: () => getRequest(id) });
  const messages = useQuery({ queryKey: ["messages", id], queryFn: () => listMessages(id) });
  const subject = request.data ? requestSubject(request.data) : null;
  const reviewed = useQuery({
    queryKey: ["reviewed", subject?.type, subject?.id, user.id],
    queryFn: () => hasReviewed(user.id, { type: subject!.type, id: subject!.id }),
    enabled: !!subject && request.data?.agreement_state === "FINISHED",
  });

  // Realtime: mensajes nuevos, cambios en la negociación y presencia en el chat (mismos canales que la app).
  useEffect(() => {
    const messagesChannel = supabase
      .channel(`message:request:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message", filter: `request=eq.${id}` }, (payload) => {
        queryClient.setQueryData<Message[]>(["messages", id], (current = []) =>
          current.some((m) => m.id === payload.new.id || (m.client_id && m.client_id === payload.new.client_id))
            ? current
            : [...current, payload.new as Message],
        );
      })
      .subscribe();
    const requestChannel = supabase
      .channel(`service_request_${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_request", filter: `id=eq.${id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["request", id] });
      })
      .subscribe();
    const presence = supabase.channel(`chat_presence_${id}`);
    presence
      .on("presence", { event: "sync" }, () => {
        const state = presence.presenceState<{ user_id: string }>();
        setPresent(Object.values(state).flat().map((entry) => entry.user_id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void presence.track({ user_id: user.id });
      });
    return () => {
      void supabase.removeChannel(messagesChannel);
      void supabase.removeChannel(requestChannel);
      void presence.untrack().finally(() => void supabase.removeChannel(presence));
    };
  }, [id, user.id, queryClient]);

  // Mensajes de este chat que siguen en la cola sin conexión.
  useEffect(() => {
    const load = () =>
      void listOutbox().then((items) =>
        setQueued(
          items
            .filter((item) => item.kind === "message" && item.payload.request === id)
            .map((item) => {
              const job = item.payload as Message & { created_at_client: string };
              return { ...job, id: item.id, created_at: job.created_at_client, updated_at: job.created_at_client, pending: true };
            }),
        ),
      );
    load();
    return onOutboxChange(() => {
      load();
      void queryClient.invalidateQueries({ queryKey: ["messages", id] });
    });
  }, [id, queryClient]);

  const all = useMemo<ChatMessage[]>(() => {
    const sent = messages.data ?? [];
    const sentIds = new Set(sent.map((m) => m.client_id));
    return [...sent, ...queued.filter((m) => !sentIds.has(m.client_id))];
  }, [messages.data, queued]);

  // Marca de lectura local y desplazamiento al último mensaje.
  useEffect(() => {
    const last = messages.data?.at(-1);
    if (last) markChatRead(user.id, id, last.created_at);
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [all.length, messages.data, id, user.id]);

  if (request.isPending) return <div className="page"><Skeletons count={3} height={120} /></div>;
  if (request.isError) return <div className="page"><ErrorState error={request.error} onRetry={() => void request.refetch()} /></div>;

  const data = request.data;
  if (data.client !== user.id && data.provider !== user.id) {
    return <div className="page"><ErrorState error={new Error("Esta solicitud no es tuya.")} /></div>;
  }
  const other = counterpart(data, user.id);
  const state = displayState(data);
  const buttons = negotiationButtons(data, user.id);
  const otherPresent = present.includes(other.id);
  const canceled = data.agreement_state === "CANCELED";
  const canReview =
    data.agreement_state === "FINISHED" && reviewed.data === false && (subject!.type === "service" || data.client === user.id);

  const notify = async (message: string, type: "SYSTEM:INFO" | "CLIENT:NEW_OFFER" | "PROVIDER:NEW_OFFER") => {
    // Como la app: si la otra persona está viendo el chat, no se le manda notificación.
    if (otherPresent) return;
    await createNotification({
      user: other.id,
      message,
      type,
      request: data.id,
      service: subject!.type === "service" ? subject!.id : null,
      contracting: subject!.type === "contracting" ? subject!.id : null,
    }).catch((error) => console.warn("[Echo] Notificación no creada:", error));
  };

  /** Lee la versión del servidor antes de decidir: así no se pierde un «ambos aceptaron». */
  async function latest(): Promise<ServiceRequestWithRelations> {
    const fresh = await getRequest(data.id);
    queryClient.setQueryData(["request", id], fresh);
    return fresh;
  }

  async function run(action: () => Promise<void>) {
    if (!navigator.onLine) {
      toast("Necesitas conexión para responder la propuesta.", "danger");
      return;
    }
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["requests"] });
    } catch (error) {
      toast((error as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  }

  const accept = () =>
    run(async () => {
      const fresh = await latest();
      if (offerChanged(data, fresh)) throw new Error("La propuesta cambió mientras la revisabas. Revisa la nueva antes de responder.");
      queryClient.setQueryData(["request", id], await updateRequest(data.id, acceptPatch(fresh, user.id)));
      await notify(`*${user.name}* aceptó la propuesta para *${subject!.name}*`, "SYSTEM:INFO");
    });

  const reject = () =>
    run(async () => {
      if (!confirm("¿Rechazar la propuesta? La otra persona podrá enviarte una nueva oferta.")) return;
      const fresh = await latest();
      if (offerChanged(data, fresh)) throw new Error("La propuesta cambió mientras la revisabas. Revisa la nueva antes de responder.");
      queryClient.setQueryData(["request", id], await updateRequest(data.id, rejectPatch(fresh, user.id)));
      await notify(`*${user.name}* rechazó la propuesta para *${subject!.name}*`, "SYSTEM:INFO");
    });

  const complete = () =>
    run(async () => {
      if (!confirm("¿Marcar como completado? Se cierra cuando ambos lo marquen.")) return;
      const fresh = await latest();
      const updated = await updateRequest(data.id, completePatch(fresh, user.id));
      queryClient.setQueryData(["request", id], updated);
      if (updated.agreement_state === "FINISHED") await finalizeRequestCompletion(data.id).catch(() => undefined);
    });

  const offer = (values: RequestFormValues) =>
    run(async () => {
      queryClient.setQueryData(["request", id], await updateRequest(data.id, offerPatch(user.id, values.price, values.date)));
      setSheet(null);
      await notify(
        `*${user.name}* hizo una nueva propuesta para *${subject!.name}*`,
        other.id === data.client ? "CLIENT:NEW_OFFER" : "PROVIDER:NEW_OFFER",
      );
    });

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || canceled) return;
    const now = new Date().toISOString();
    const job = { client_id: newMessageClientId(user.id, now), created_at_client: now, content, sender: user.id, request: data.id };
    setText("");
    try {
      const saved = await upsertMessage(job);
      queryClient.setQueryData<Message[]>(["messages", id], (current = []) =>
        current.some((m) => m.id === saved.id) ? current : [...current, saved],
      );
    } catch (error) {
      if (!isNetworkError(error)) {
        toast("No se pudo enviar el mensaje.", "danger");
        setText(content);
        return;
      }
      // Sin conexión: el mensaje queda en la cola y Background Sync lo envía al reconectar.
      await enqueueMessage(job);
    }
  }

  async function submitReview(rating: number, comment: string) {
    await run(async () => {
      const isClientSide = subject!.type === "contracting" || data.client === user.id;
      await createReview({
        service: subject!.type === "service" ? subject!.id : undefined,
        contracting: subject!.type === "contracting" ? subject!.id : undefined,
        request: data.id,
        reviewer: user.id,
        reviewed: isClientSide ? data.provider : data.client,
        rating,
        comment,
        type: isClientSide ? "AS_CLIENT" : "AS_PROVIDER",
      });
      setSheet(null);
      await queryClient.invalidateQueries({ queryKey: ["reviewed"] });
      await createNotification({
        user: other.id,
        message: `*${user.name}* dejó una valoración para *${subject!.name}*`,
        type: "SYSTEM:INFO",
        request: data.id,
        service: subject!.type === "service" ? subject!.id : null,
        contracting: subject!.type === "contracting" ? subject!.id : null,
      }).catch(() => undefined);
      toast("¡Gracias por tu valoración!", "success");
    });
  }

  return (
    <div className="chat">
      <div className="chat-top">
        <BackHeader
          onBack={() => navigate("/solicitudes")}
          title={other.name}
          subtitle={subject!.name}
          actions={
            <Link className="icon-btn" to={subject!.type === "service" ? `/servicio/${subject!.id}` : `/contratacion/${subject!.id}`} aria-label="Ver publicación">
              <Icon name="briefcase" size={18} />
            </Link>
          }
        />

        <section className="negotiation" aria-label="Negociación">
          <div className="negotiation-top">
            <div>
              <span className="subtle">Propuesta actual</span>
              <div className="negotiation-offer">
                <strong>{formatPrice(data.agreed_price)}</strong>
                <span className="muted">
                  <Icon name="calendar" size={14} /> {formatDay(data.agreed_date)}
                </span>
              </div>
            </div>
            <StatePill state={state} />
          </div>
          <div className="parties">
            <Party name={data.client === user.id ? "Tú" : data.client_profile.name} label={partyLabel(data, "client")} />
            <Icon name="back" size={16} />
            <Party name={data.provider === user.id ? "Tú" : data.provider_profile.name} label={partyLabel(data, "provider")} align="end" />
          </div>
          {data.notes ? <p className="negotiation-notes muted">«{data.notes}»</p> : null}

          {state === "CANCELED" || state === "FINISHED" ? (
            canReview ? (
              <button className="btn btn-primary btn-block" type="button" onClick={() => setSheet("review")}>
                Valorar a {firstName(other.name)}
              </button>
            ) : state === "FINISHED" ? (
              <p className="subtle center">Trabajo finalizado{reviewed.data ? " · ya dejaste tu valoración" : ""}.</p>
            ) : null
          ) : buttons.showCompletion ? (
            <div className="negotiation-actions two">
              <button className="btn btn-danger" type="button" onClick={reject} disabled={busy}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="button" onClick={complete} disabled={busy || !buttons.canComplete}>
                {buttons.canComplete ? "Completar" : "Esperando"}
              </button>
            </div>
          ) : (
            <div className="negotiation-actions">
              <button className="btn btn-danger" type="button" onClick={reject} disabled={busy || !buttons.canRespond}>
                Rechazar
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setSheet("offer")} disabled={busy || !buttons.canOffer}>
                Ofertar
              </button>
              <button className="btn btn-primary" type="button" onClick={accept} disabled={busy || !buttons.canRespond}>
                Aceptar
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="messages" aria-live="polite" aria-label="Mensajes">
        {messages.isPending ? (
          <Skeletons count={3} height={44} />
        ) : all.length === 0 ? (
          <div className="chat-empty">
            <span className="empty-icon">
              <Icon name="chat" size={22} />
            </span>
            <h3>Empieza la conversación</h3>
            <p className="muted">Pregunta detalles antes de cerrar el trato. Los mensajes se guardan aunque no tengas conexión.</p>
          </div>
        ) : (
          all.map((message) => (
            <div key={message.client_id ?? message.id} className={`bubble ${message.sender === user.id ? "mine" : ""} ${message.pending ? "pending" : ""}`}>
              <p>{message.content}</p>
              <span className="bubble-meta">
                {formatTime(message.created_at_client ?? message.created_at)}
                {message.pending ? (
                  <>
                    {" "}
                    · <Icon name="clock" size={11} /> Pendiente
                  </>
                ) : null}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </section>

      <form className="composer" onSubmit={send}>
        <input
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={canceled ? "Esta solicitud fue cancelada" : "Escribe un mensaje…"}
          disabled={canceled}
          aria-label="Mensaje"
          maxLength={1000}
        />
        <button className="send" type="submit" disabled={!text.trim() || canceled} aria-label="Enviar">
          <Icon name="send" size={18} />
        </button>
      </form>

      <Sheet open={sheet === "offer"} title="Nueva propuesta" onClose={() => setSheet(null)}>
        <p className="muted">Cambia el precio o la fecha. {firstName(other.name)} tendrá que aceptarla de nuevo.</p>
        <RequestForm mode="offer" defaultPrice={Number(data.agreed_price)} defaultDate={data.agreed_date} submitLabel="Enviar propuesta" busy={busy} onSubmit={offer} />
      </Sheet>
      <Sheet open={sheet === "review"} title={`¿Cómo te fue con ${firstName(other.name)}?`} onClose={() => setSheet(null)}>
        <ReviewForm busy={busy} onSubmit={submitReview} />
      </Sheet>
    </div>
  );
}

function Party({ name, label, align }: { name: string; label: string; align?: "end" }) {
  const tone = label === "Aceptó" ? "success" : label === "Rechazó" ? "danger" : label === "Completó" ? "done" : "accent";
  return (
    <div className={`party ${align === "end" ? "end" : ""}`}>
      <Avatar user={{ name, avatar: "" }} size={36} />
      <div>
        <strong>{name}</strong>
        <span className="party-label" data-tone={tone}>
          {label}
        </span>
      </div>
    </div>
  );
}

function ReviewForm({ busy, onSubmit }: { busy: boolean; onSubmit: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating > 0) onSubmit(rating, comment.trim());
      }}
    >
      <div className="star-picker" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} estrellas`} className={value <= rating ? "on" : ""} onClick={() => setRating(value)}>
            <Icon name="star" size={34} fill={value <= rating} />
          </button>
        ))}
      </div>
      <label className="field">
        <span>Comentario (opcional)</span>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      </label>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy || rating === 0}>
        Publicar valoración
      </button>
    </form>
  );
}
