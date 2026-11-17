import { useNegotiationCtx } from "@/context/Negotiation";
import { User } from "@/models/User";
import * as NS from "@/utils/negotiation";
import useJobsDone from "./useJobsDone";
import {
  getRemoteServiceRequestById,
  serviceRequestsKeys,
  updateServiceRequest,
} from "@/api/serviceRequests";
import { ServiceRequestWithRelations } from "@/api/types";
import { getOfflineNetworkState } from "@/offline/network";
import { withTimeout } from "@/utils/async";
import { createNotification, notificationsKeys } from "@/api/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { contractingsKeys } from "@/api/contractings";

type Options = {
  shouldNotifyCounterparty?: boolean;
};

const LATEST_REQUEST_TIMEOUT_MS = 4000;

const sameInstant = (a: string, b: string) =>
  a === b || Date.parse(a) === Date.parse(b);

export default function useRequestStatus(
  authUser: User,
  options: Options = {},
) {
  const { request, client, provider, subject, setRequest } = useNegotiationCtx();
  const queryClient = useQueryClient();

  const { addJob } = useJobsDone(provider);
  const counterparty = authUser.id === client.id ? provider : client;
  const updateCurrentRequest = (patch: Parameters<typeof updateServiceRequest>[1]) =>
    updateServiceRequest(request.id, patch, authUser.id);

  /**
   * The request as the server has it right now (when reachable).
   *
   * Whether an action closes the deal ("both accepted", "both completed")
   * depends on what the other person already did. The copy on screen is only
   * as fresh as the last realtime event, so deciding on it can leave a request
   * where both sides accepted but it never moves to ACCEPTED. Falls back to
   * the local copy when offline, on timeout, or when it holds newer unsynced
   * changes.
   */
  async function getLatestRequest(): Promise<ServiceRequestWithRelations> {
    if (!getOfflineNetworkState()) return request;

    try {
      const remote = await withTimeout(
        getRemoteServiceRequestById(request.id),
        LATEST_REQUEST_TIMEOUT_MS,
        null,
      );
      if (!remote) return request;

      return Date.parse(remote.updated_at) >= Date.parse(request.updated_at)
        ? remote
        : request;
    } catch {
      return request;
    }
  }

  /**
   * Accepting or rejecting applies to the offer on screen. If the other
   * person sent a new one in the meantime, show it instead of answering it
   * blindly.
   */
  function assertOfferUnchanged(latest: ServiceRequestWithRelations) {
    const changed =
      Number(latest.agreed_price) !== Number(request.agreed_price) ||
      !sameInstant(latest.agreed_date, request.agreed_date) ||
      latest.last_offer_user !== request.last_offer_user;

    if (!changed) return;

    setRequest(latest);
    throw new Error(
      "La propuesta cambió mientras la revisabas. Revisa la nueva antes de responder.",
    );
  }

  async function notifyCounterparty(action: "accepted" | "rejected") {
    if (!options.shouldNotifyCounterparty) return;

    const actionText = action === "accepted" ? "aceptó" : "rechazó";

    try {
      await createNotification({
        user: counterparty.id,
        message: `*${authUser.name}* ${actionText} la propuesta para *${subject.name}*`,
        type: "SYSTEM:INFO",
        read: false,
        request: request.id,
        service: subject.type === "service" ? subject.id : undefined,
        contracting: subject.type === "contracting" ? subject.id : undefined,
      });
      queryClient.invalidateQueries({
        queryKey: notificationsKeys.byUser(counterparty.id),
      });
      queryClient.invalidateQueries({
        queryKey: notificationsKeys.unreadCount(counterparty.id),
      });
    } catch (err) {
      console.log(`Failed to create ${action} notification:`, err);
    }
  }

  async function setUserToAgreed() {
    const latest = await getLatestRequest();
    assertOfferUnchanged(latest);

    if (authUser.id === client.id) {
      if (NS.providerAgreed(latest)) {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "ACCEPTED",
          agreement_state: "ACCEPTED",
        });
        setRequest(updatedRequest);
      } else {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "ACCEPTED",
        });
        setRequest(updatedRequest);
      }
    } else {
      if (NS.clientAgreed(latest)) {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "ACCEPTED",
          agreement_state: "ACCEPTED",
        });
        setRequest(updatedRequest);
      } else {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "ACCEPTED",
        });
        setRequest(updatedRequest);
      }
    }

    await notifyCounterparty("accepted");
  }

  async function setUserToRejected() {
    const latest = await getLatestRequest();
    assertOfferUnchanged(latest);

    if (authUser.id === client.id) {
      if (NS.providerRejected(latest)) {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "REJECTED",
          agreement_state: "CANCELED",
          canceled: new Date().toISOString(),
        });
        setRequest(updatedRequest);
      } else {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "REJECTED",
        });
        setRequest(updatedRequest);
      }
    } else {
      if (NS.clientRejected(latest)) {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "REJECTED",
          agreement_state: "CANCELED",
          canceled: new Date().toISOString(),
        });
        setRequest(updatedRequest);
      } else {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "REJECTED",
        });
        setRequest(updatedRequest);
      }
    }

    await notifyCounterparty("rejected");
  }

  async function setUserToCompleted() {
    const latest = await getLatestRequest();

    if (authUser.id === client.id) {
      if (NS.providerMarkedCompleted(latest)) {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "COMPLETED",
          agreement_state: "FINISHED",
          finished: new Date().toISOString(),
        });
        setRequest(updatedRequest);
        await addJob(request.id);
        await queryClient.invalidateQueries({
          queryKey: serviceRequestsKeys.allForUser(client.id),
        });
        await queryClient.invalidateQueries({
          queryKey: serviceRequestsKeys.allForUser(provider.id),
        });
        if (subject.type === "contracting") {
          await queryClient.invalidateQueries({
            queryKey: contractingsKeys.all,
          });
        }
      } else {
        const updatedRequest = await updateCurrentRequest({
          client_offer_status: "COMPLETED",
        });
        setRequest(updatedRequest);
      }
    } else {
      if (NS.clientMarkedCompleted(latest)) {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "COMPLETED",
          agreement_state: "FINISHED",
          finished: new Date().toISOString(),
        });
        setRequest(updatedRequest);
        await addJob(request.id);
        await queryClient.invalidateQueries({
          queryKey: serviceRequestsKeys.allForUser(client.id),
        });
        await queryClient.invalidateQueries({
          queryKey: serviceRequestsKeys.allForUser(provider.id),
        });
        if (subject.type === "contracting") {
          await queryClient.invalidateQueries({
            queryKey: contractingsKeys.all,
          });
        }
      } else {
        const updatedRequest = await updateCurrentRequest({
          provider_offer_status: "COMPLETED",
        });
        setRequest(updatedRequest);
      }
    }
  }

  return { setUserToAgreed, setUserToRejected, setUserToCompleted };
}
