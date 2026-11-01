import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { useStaffOperation } from "@/features/accounts/useStaffOperation";
import { billingKey } from "@/features/billing/api";
import { kitchenKey } from "@/features/kitchen/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  acceptPickup,
  pendingPickupsQuery,
  pickupKey,
  rejectPickup,
  type PendingPickup,
  type RejectReason,
} from "./api";
import { pickupMessages } from "./messages";
import { waitingPickups } from "./state";

export function usePickupDesk(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const view = useLiveView();
  const enabled = account.services.pickup;
  const { restaurantId, userId } = account;
  const options = useMemo(
    () => pendingPickupsQuery({ restaurantId, userId }),
    [restaurantId, userId],
  );
  const query = useQuery({
    ...options,
    enabled: enabled && view.active,
    refetchInterval: enabled && view.active ? 10_000 : false,
  });
  const operation = useStaffOperation(account, enabled);
  const [openedAt] = useState(Date.now);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
    scope: string;
  } | null>(null);
  const scope = `${restaurantId}:${userId}`;
  const syncedSince = Math.max(openedAt, view.resumeAfter);
  const fresh = syncIsFresh(
    query.data?.receivedAt ?? 0,
    view.now,
    syncedSince,
    view.active,
    query.isError,
  );
  const stalled =
    enabled &&
    syncIsStalled(
      fresh,
      view.now,
      Math.max(openedAt, view.resumeAfter),
      view.active,
      query.isError,
    );
  const requests = waitingPickups(query.data?.items ?? [], view.now);
  // Keep alerting for known, unexpired requests if a later poll fails. A resumed screen must first
  // read again; failure/staleness blocks decisions independently of this reminder.
  const ringing =
    enabled && view.active && requests.length > 0 && (query.data?.receivedAt ?? 0) >= syncedSince;

  useEffect(() => {
    let alive = true;
    // A read started before resume is not a fresh poll, even if it finishes afterwards.
    void client.cancelQueries({ queryKey: options.queryKey }).then(() => {
      if (alive && enabled && view.active)
        void client.invalidateQueries({ queryKey: options.queryKey });
    });
    return () => {
      alive = false;
    };
  }, [client, options, enabled, view.active, view.resumeAfter]);

  async function decide<T>(
    request: PendingPickup,
    send: (signal: AbortSignal) => Promise<T>,
    done: (result: T) => string,
  ) {
    if (!fresh || !waitingPickups([request], Date.now()).length) return false;
    const work = operation.start();
    if (!work) return false;
    let handled = false;
    setNotice(null);
    try {
      const result = await send(work.signal);
      if (!work.current()) return false;
      setNotice({ tone: "success", text: done(result), scope });
      handled = true;
    } catch (error) {
      if (!work.current()) return false;
      setNotice({
        tone: "error",
        text:
          error instanceof ApiError && error.code === "PICKUP_CHANGED"
            ? m.changed
            : errorMessage(error, m.unknown, language),
        scope,
      });
      handled = true;
    } finally {
      if (work.current()) {
        await client.cancelQueries({ queryKey: options.queryKey });
        if (work.current()) {
          // No marker or replay: GET of the pending list answers an uncertain accept/reject.
          for (const key of [pickupKey(account), kitchenKey(account), billingKey(account)])
            void client.invalidateQueries({ queryKey: key });
        }
      }
      handled = handled && work.current();
      work.finish();
    }
    return handled;
  }

  return {
    view,
    requests,
    fresh,
    ringing,
    stalled,
    busy: operation.busy,
    limit: query.data?.limit ?? 20,
    notice: notice?.scope === scope ? notice : null,
    accept: (request: PendingPickup, minutes: number) =>
      decide(
        request,
        (signal) => acceptPickup(request.id, minutes, signal),
        (result) => m.accepted(result.pickupNumber, formatTime(result.estimatedReadyAt, language)),
      ),
    reject: (request: PendingPickup, reason: RejectReason | null) =>
      decide(
        request,
        (signal) => rejectPickup(request.id, reason, signal),
        () => m.rejected(request.pickupNumber),
      ),
  };
}
