import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type SubscriptionCallback<T> = (payload: {
  action: "INSERT" | "UPDATE" | "DELETE";
  record: T;
  old_record?: T;
}) => Promise<void>;

export default function useSubscription<T>(
  collection: string,
  track: string,
  callback: SubscriptionCallback<T>,
) {
  // Always call the latest callback without re-subscribing on every render.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const channel = supabase
      .channel(`${collection}_${track}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: collection,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const action =
            payload.eventType === "INSERT"
              ? "INSERT"
              : payload.eventType === "UPDATE"
                ? "UPDATE"
                : "DELETE";

          // The callback usually refetches; a failed refetch must not surface
          // as an unhandled promise rejection.
          Promise.resolve(
            callbackRef.current({
              action,
              record: (payload.new || {}) as T,
              old_record: (payload.old || undefined) as T | undefined,
            }),
          ).catch((error) => {
            console.log(`[realtime] ${collection} handler failed:`, error);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [collection, track]);
}
