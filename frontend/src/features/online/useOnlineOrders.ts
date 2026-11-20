import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { invalidateStoreViews } from "@/lib/store-views";
import { onLifecycleChange, useLiveView } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  acceptOnlineRequest,
  onlineActiveQuery,
  onlinePendingQuery,
  rejectOnlineRequest,
  type OnlinePendingRequest,
} from "./api";
import { onlineOrdersMessages } from "./messages";
import type { RejectReason } from "./state";

type OrdersNotice = { tone: "success" | "warning" | "error"; text: string; requestId?: string };

// The online orders page: the pending list (shared with the banner) and the accepted orders in progress,
// both polled every 10 seconds while visible and online. Accept and reject persist no pending marker:
// each applies only to a request still waiting, so a repeat just gets ONLINE_REQUEST_CHANGED, and after
// an unknown result the refreshed list shows whether the request is still waiting.
export function useOnlineOrders(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const view = useLiveView();
  const [openedAt] = useState(Date.now);
  const polling = {
    enabled: view.active,
    refetchInterval: view.active ? 10_000 : false,
    refetchIntervalInBackground: false,
  } as const;
  const pending = useQuery({ ...onlinePendingQuery(account), ...polling });
  const active = useQuery({ ...onlineActiveQuery(account), ...polling });
  const fresh = syncIsFresh(
    pending.data?.receivedAt ?? 0,
    view.now,
    view.resumeAfter,
    view.active,
    pending.isError,
  );
  const stalled = syncIsStalled(
    fresh,
    view.now,
    Math.max(view.resumeAfter, openedAt),
    view.active,
    pending.isError,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<OrdersNotice | null>(null);
  const ops = useOperations();

  useEffect(
    () =>
      onLifecycleChange(() => {
        // Late answers no longer apply; the list read after the change shows what happened.
        ops.cancelAll();
        setBusy(null);
      }),
    [ops],
  );

  // A decision changes the pending and active lists, and an acceptance the kitchen, pass and bills.
  const refresh = useCallback(
    () =>
      invalidateStoreViews(client, account, [
        "online-pending",
        "online-active",
        "kitchen",
        "pass",
        "billing",
      ]),
    [client, account],
  );

  async function decide(
    request: OnlinePendingRequest,
    send: (signal: AbortSignal) => Promise<string>,
  ) {
    if (!fresh || busy || !isSameAccount(client, account)) return false;
    const op = ops.start(request.id);
    if (!op) return false;
    const current = () => op.isCurrent() && isSameAccount(client, account);
    setBusy(request.id);
    setNotice(null);
    let done = false;
    try {
      const text = await send(withTimeout(op.signal));
      if (!current()) return false;
      setNotice({ tone: "success", text });
      done = true;
    } catch (e) {
      if (!current()) return false;
      if (e instanceof ApiError && e.code === "ONLINE_REQUEST_CHANGED")
        setNotice({ tone: "warning", text: m.changed });
      else if (e instanceof ApiError && e.code === "DELIVERY_FEE_CHANGED")
        setNotice({
          tone: "warning",
          text: errorMessage(e, undefined, language),
          requestId: request.id,
        });
      else if (e instanceof ApiError && e.status < 500)
        setNotice({ tone: "error", text: errorMessage(e, undefined, language) });
      else setNotice({ tone: "warning", text: m.unknown });
    } finally {
      if (op.finish()) setBusy(null);
      // Every outcome rereads the lists: success, a lost race and an unknown result alike.
      if (current()) refresh();
    }
    return done;
  }

  return {
    view,
    pending,
    active,
    fresh,
    stalled,
    busy,
    notice,
    refresh,
    accept: (
      request: OnlinePendingRequest,
      minutes: number,
      fee: number | null,
      maxMeters: number | null,
    ) =>
      decide(request, async (signal) => {
        const order = await acceptOnlineRequest(request.id, minutes, fee, maxMeters, signal);
        const time = formatTime(order.estimatedAt, language);
        return order.channel === "DELIVERY"
          ? m.acceptedDelivery(order.number, time)
          : m.accepted(order.number, time);
      }),
    reject: (request: OnlinePendingRequest, reason: RejectReason | null) =>
      decide(request, async (signal) => {
        await rejectOnlineRequest(request.id, reason, signal);
        return m.rejected(request.number);
      }),
  };
}
