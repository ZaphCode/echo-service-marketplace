import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createNotification, insertRequest, type NewNotification, type NewRequest } from "../api/requests";
import type { User } from "../api/models";
import { isNetworkError } from "../lib/supabase";
import { enqueueRequest } from "../pwa/outbox";
import { useToast } from "../components/Layout";
import type { RequestFormValues } from "../components/RequestForm";

type Target =
  | { type: "service"; id: string; name: string; providerId: string }
  | { type: "contracting"; id: string; name: string; ownerId: string };

/**
 * Crea una solicitud (servicio) o una aplicación (contratación), igual que la app móvil, y avisa a
 * la otra parte con una notificación. Sin conexión, la guarda en la cola de Background Sync.
 */
export function useCreateRequest(user: User) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function create(target: Target, values: RequestFormValues) {
    const isService = target.type === "service";
    const request: NewRequest = {
      id: crypto.randomUUID(),
      service: isService ? target.id : null,
      contracting: isService ? null : target.id,
      client: isService ? user.id : target.ownerId,
      provider: isService ? target.providerId : user.id,
      last_offer_user: user.id,
      agreed_price: values.price,
      agreed_date: values.date,
      notes: values.notes,
      agreement_state: "NEGOTIATION",
      client_offer_status: "PENDING",
      provider_offer_status: "PENDING",
    };
    const notification: NewNotification = isService
      ? {
          user: target.providerId,
          message: `Nueva solicitud de servicio de *${user.name}* para *${target.name}*`,
          type: "PROVIDER:NEW_REQUEST",
          request: request.id,
          service: target.id,
          contracting: null,
        }
      : {
          user: target.ownerId,
          message: `Nueva aplicación de *${user.name}* para *${target.name}*`,
          type: "PROVIDER:NEW_APPLICATION",
          request: request.id,
          service: null,
          contracting: target.id,
        };

    setBusy(true);
    try {
      await insertRequest(request);
      await createNotification(notification).catch((error) => console.warn("[Echo] Notificación no creada:", error));
      await queryClient.invalidateQueries({ queryKey: ["requests"] });
      navigate(`/chat/${request.id}`);
    } catch (error) {
      if (!isNetworkError(error)) {
        toast(`No se pudo enviar: ${(error as Error).message}`, "danger");
        return;
      }
      await enqueueRequest({ request, notification, subjectName: target.name });
      toast("Sin conexión: tu solicitud se enviará en cuanto vuelva la red.", "success");
      navigate("/solicitudes");
    } finally {
      setBusy(false);
    }
  }

  return { create, busy };
}
