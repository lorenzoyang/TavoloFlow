import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import type { OrderLine } from "@/features/orders/api";
import { orderChime } from "@/lib/alert-sound";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { displayName } from "@/lib/language";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { staffMessages } from "@/lib/staff-messages";
import { invalidateStoreViews } from "@/lib/store-views";
import { useAlertSound } from "@/lib/useAlertSound";
import { isLive, onLifecycleChange, useLiveView } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { usePendingMarkers } from "@/lib/usePendingMarkers";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { uniqueBy } from "@/lib/utils";
import {
  cancelItem,
  kitchenKey,
  markReady,
  readKitchen,
  readKitchenOrder,
  type KitchenOrder,
  type KitchenPage,
} from "./api";
import { kitchenMessages } from "./messages";
import {
  dishGroups,
  pendingKitchenKey,
  readPending,
  recoveryOutcome,
  type KitchenView,
  type OrderStatus,
  type PendingKitchenAction,
} from "./state";
import { useKitchenCategories } from "./useKitchenCategories";
import { useKitchenChime } from "./useKitchenChime";

const markerOrder = (marker: PendingKitchenAction) => marker.orderId;

// The kitchen queue: polls the open visits' orders, announces new ones and marks each line READY or
// CANCELLED. Writes need a fresh view; each one is marked before its POST so that a lost result is
// checked by GET, and one operation at a time runs per order.
export function useKitchen(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
  const { restaurantId, userId, role } = account;
  const scope = useMemo(() => kitchenKey({ restaurantId, userId }), [restaurantId, userId]);
  const sameAccount = useCallback(
    () => isSameAccount(client, { restaurantId, userId, role }),
    [client, restaurantId, userId, role],
  );

  // Data counts as synced only after a poll received since this page opened or last resumed.
  const live = useLiveView();
  const [openedAt] = useState(Date.now);
  const resumedAt = Math.max(live.resumeAfter, openedAt);
  const [view, setView] = useState<KitchenView>("DISHES");
  const [switchedAt, setSwitchedAt] = useState(0);
  const status: OrderStatus = view === "PROCESSED" ? "PROCESSED" : "NEW";
  const query = useInfiniteQuery({
    queryKey: [...scope, status],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readKitchen(status, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: live.active,
    refetchInterval: live.active ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const head = query.data?.pages[0];
  const fresh = syncIsFresh(head?.receivedAt ?? 0, live.now, resumedAt, live.active, query.isError);
  const stalled = syncIsStalled(
    fresh,
    live.now,
    Math.max(resumedAt, switchedAt),
    live.active,
    query.isError,
  );
  // Restaurant-wide figures (pending count, last sync) come from the newest poll of any tab, so they
  // stay in place while a newly selected tab loads.
  const [summary, setSummary] = useState(head);
  if (head && head.receivedAt > (summary?.receivedAt ?? 0)) setSummary(head);
  const orders = useMemo(
    () =>
      uniqueBy(
        (query.data?.pages ?? []).flatMap((page) => page.items),
        (order) => order.id,
      ).filter((order) => order.status === status),
    [query.data, status],
  );

  const categories = useKitchenCategories(account, live.active);
  const { filter, hidden } = categories;

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Orders with any operation running (write or recovery), and those with a write running.
  const [busy, setBusy] = useState<string[]>([]);
  const [writing, setWriting] = useState<string[]>([]);
  // The newest version of each order a write or recovery returned, for the cancel confirmation.
  const [latest, setLatest] = useState<Record<string, KitchenOrder>>({});
  const { play, ...sound } = useAlertSound("tavoloflow:kitchen-sound", orderChime);

  const ops = useOperations();
  const markers = usePendingMarkers({
    storageKey: pendingKitchenKey(restaurantId, userId),
    parse: readPending,
    idOf: markerOrder,
    recover,
  });
  const { recoverAll, discardStored } = markers;

  // A screen hiding categories judges its own new lines only while every NEW order is loaded.
  const screenLines = useMemo(
    () =>
      filter && status === "NEW" && !query.hasNextPage
        ? orders.flatMap((order) =>
            order.items.filter((i) => i.status === "NEW" && filter(i)).map((i) => i.id),
          )
        : null,
    [filter, status, query.hasNextPage, orders],
  );
  const announce = useCallback(
    (added: number | null) => {
      // Server arrivals are an external event, announced even when audio is disabled.
      setNotice(added !== null ? m.screenArrivals(added) : m.arrivals(head?.pendingCount ?? 0));
      play();
    },
    [m, head?.pendingCount, play],
  );
  useKitchenChime({ head, active: live.active, resumedAt, screenLines, hidden, announce });

  async function refresh() {
    await client.invalidateQueries({ queryKey: scope, refetchType: "active" });
    invalidateStoreViews(client, account, ["dining", "floor", "billing", "pass"]);
  }

  // Puts an order returned by a write or recovery in place in every loaded page.
  async function acceptOrder(order: KitchenOrder, valid: () => boolean) {
    // Stop older list reads before applying a newer mutation/recovery result.
    await client.cancelQueries({ queryKey: scope });
    if (!valid()) return;
    setLatest((values) => ({ ...values, [order.id]: order }));
    client.setQueriesData<InfiniteData<KitchenPage>>({ queryKey: scope }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === order.id ? order : item)),
            })),
          }
        : data,
    );
    void refresh();
  }

  useEffect(() => {
    let mounted = true;
    const stop = onLifecycleChange(() => {
      // Results of work started before the change no longer apply; the pending markers stay.
      ops.cancelAll();
      setBusy([]);
      setWriting([]);
      // Reread the queue, without letting a read started before the change land after it.
      const online = isLive();
      void client.cancelQueries({ queryKey: scope }).then(() => {
        if (mounted && online && sameAccount()) void client.invalidateQueries({ queryKey: scope });
      });
      recoverAll();
    });
    return () => {
      mounted = false;
      stop();
      void client.cancelQueries({ queryKey: scope });
      if (!sameAccount()) discardStored();
    };
  }, [ops, client, scope, sameAccount, recoverAll, discardStored]);

  async function recover(action: PendingKitchenAction) {
    if (!isLive() || !sameAccount()) return;
    const op = ops.start(action.orderId);
    if (!op) return;
    const current = () => op.isCurrent() && sameAccount();
    setBusy((ids) => [...ids, action.orderId]);
    try {
      const order = await readKitchenOrder(action.orderId, withTimeout(op.signal));
      if (!current()) return;
      if (order.sessionId !== action.sessionId) throw new Error("Invalid recovery session");
      await acceptOrder(order, current);
      if (!current()) return;
      markers.remove(action.orderId);
      const result = recoveryOutcome(
        action,
        order.items.find((i) => i.id === action.itemId)?.status,
      );
      setNotice(m.recovered(c.table(order.tableLabel), result));
      setError("");
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && (e.code === "SESSION_CLOSED" || e.code === "ORDER_NOT_FOUND")) {
        markers.remove(action.orderId);
        setNotice(m.recoveryClosed);
        void refresh();
      } else setError(errorMessage(e, m.recoveryUnknown, language));
    } finally {
      if (op.finish()) setBusy((ids) => ids.filter((id) => id !== action.orderId));
    }
  }

  async function perform(order: KitchenOrder, item: OrderLine, kind: "ready" | "cancel") {
    if (!fresh || item.status !== "NEW" || markers.has(order.id) || !sameAccount()) return;
    const op = ops.start(order.id);
    if (!op) return;
    const current = () => op.isCurrent() && sameAccount();
    setBusy((ids) => [...ids, order.id]);
    setWriting((ids) => [...ids, order.id]);
    markers.add({ orderId: order.id, sessionId: order.sessionId, kind, itemId: item.id });
    try {
      const signal = withTimeout(op.signal);
      const result =
        kind === "cancel"
          ? await cancelItem(order.id, item.id, signal)
          : await markReady(order.id, item.id, signal);
      if (!current()) return;
      if (
        result.sessionId !== order.sessionId ||
        result.items.find((line) => line.id === item.id)?.status !==
          (kind === "ready" ? "READY" : "CANCELLED")
      )
        throw new Error("Invalid item operation result");
      await acceptOrder(result, current);
      if (!current()) return;
      markers.remove(order.id);
      // Feedback is replaced when the result arrives, not cleared on tap, so it does not flicker.
      setError("");
      const dish = displayName(item, order.defaultLanguage, language).text;
      setNotice(m.done(`${c.table(result.tableLabel)} · ${dish} ×${item.quantity}`, kind));
      return result;
    } catch (e) {
      if (!current()) return;
      setNotice("");
      if (e instanceof ApiError && e.status < 500) {
        // A rejection is a definite answer: nothing was written, so nothing is left to recover.
        markers.remove(order.id);
        setError(errorMessage(e, undefined, language));
        if (e.status === 409) {
          // A cancellation confirmation cannot survive the target item becoming terminal.
          try {
            const updated = await readKitchenOrder(order.id, withTimeout(op.signal));
            if (current()) await acceptOrder(updated, current);
          } catch {
            if (current()) void refresh();
          }
        }
      } else setError(m.writeUnknown);
    } finally {
      if (op.finish()) {
        setBusy((ids) => ids.filter((id) => id !== order.id));
        setWriting((ids) => ids.filter((id) => id !== order.id));
      }
    }
  }

  return {
    view,
    status,
    // A tab's cached orders stay writable while younger than 30 seconds, like any poll; the switch only
    // restarts the grace period before an unfinished first load is reported. The two NEW views share
    // one query, so switching between them changes nothing to wait for.
    setView: (next: KitchenView) => {
      if (next === view) return;
      if ((next === "PROCESSED") !== (status === "PROCESSED")) setSwitchedAt(Date.now());
      setView(next);
      setError("");
    },
    query,
    head,
    summary,
    orders,
    dishes: view === "DISHES" ? dishGroups(orders, filter ?? undefined) : [],
    categories,
    fresh,
    stalled,
    active: live.active,
    now: live.now,
    notice,
    error,
    busy,
    // Each marker is persisted before its POST, but shown only once the result is unknown (a failed or
    // timed-out request, or a reload); while the request is in flight only its ticket is locked.
    pending: markers.markers.filter((p) => !writing.includes(p.orderId)),
    storageWarning: markers.storageWarning,
    latest,
    ...sound,
    perform,
    recover,
    refresh,
  };
}
