import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { billingKey } from "@/features/billing/api";
import { displayName } from "@/lib/language";
import type { OrderLine } from "@/features/orders/api";
import { diningKey, floorKey } from "@/features/dining/api";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { orderChime } from "@/lib/alert-sound";
import { useAlertSound } from "@/lib/useAlertSound";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { uniqueBy } from "@/lib/utils";
import { passKey } from "@/features/pass/api";
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
  arrivals,
  dishGroups,
  pendingKitchenKey,
  readPending,
  recoveryOutcome,
  type ArrivalBaseline,
  type KitchenView,
  type OrderStatus,
  type PendingKitchenAction,
} from "./state";

export function useKitchen(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
  const [view, setView] = useState<KitchenView>("DISHES");
  const status: OrderStatus = view === "PROCESSED" ? "PROCESSED" : "NEW";
  const [active, setActive] = useState(isLive);
  const [resumeAfter, setResumeAfter] = useState(Date.now);
  const [switchedAt, setSwitchedAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  const [writing, setWriting] = useState<string[]>([]);
  const { play, ...sound } = useAlertSound("tavoloflow:kitchen-sound", orderChime);
  const { restaurantId, userId, role } = account;
  const storageKey = pendingKitchenKey(restaurantId, userId);
  const [pending, setPending] = useState<PendingKitchenAction[]>(() => {
    try {
      return readPending(sessionStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });
  const pendingRef = useRef(pending);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const operations = useRef(new Map<string, AbortController>());
  const baseline = useRef<ArrivalBaseline>(null);
  const [latest, setLatest] = useState<Record<string, KitchenOrder>>({});
  const scope = useMemo(() => kitchenKey({ restaurantId, userId }), [restaurantId, userId]);
  const query = useInfiniteQuery({
    queryKey: [...scope, status],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readKitchen(status, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: active,
    refetchInterval: active ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const head = query.data?.pages[0];
  const fresh = syncIsFresh(head?.receivedAt ?? 0, now, resumeAfter, active, query.isError);
  const stalled = syncIsStalled(
    fresh,
    now,
    Math.max(resumeAfter, switchedAt),
    active,
    query.isError,
  );
  // Restaurant-wide figures (pending count, last sync) come from the newest poll of any tab, so they
  // stay in place while a newly selected tab loads.
  const [summary, setSummary] = useState(head);
  if (head && head.receivedAt > (summary?.receivedAt ?? 0)) setSummary(head);

  const sameAccount = useCallback(
    () => isSameAccount(client, { restaurantId, userId, role }),
    [client, restaurantId, userId, role],
  );

  const remember = useCallback(
    (entries: PendingKitchenAction[]) => {
      pendingRef.current = entries;
      setPending(entries);
      try {
        if (entries.length) sessionStorage.setItem(storageKey, JSON.stringify(entries));
        else sessionStorage.removeItem(storageKey);
      } catch {
        setStorageWarning(true);
      }
    },
    [storageKey],
  );
  const forget = useCallback(
    (id: string) => remember(pendingRef.current.filter((p) => p.orderId !== id)),
    [remember],
  );

  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: scope, refetchType: "active" });
    void client.invalidateQueries({ queryKey: diningKey({ restaurantId, userId }) });
    void client.invalidateQueries({ queryKey: floorKey({ restaurantId, userId }) });
    void client.invalidateQueries({ queryKey: billingKey({ restaurantId, userId }) });
    void client.invalidateQueries({ queryKey: passKey({ restaurantId, userId }) });
  }, [restaurantId, userId, scope, client]);

  const acceptOrder = useCallback(
    async (order: KitchenOrder, valid: () => boolean) => {
      // Stop older list reads before applying a newer mutation/recovery result.
      await client.cancelQueries({ queryKey: scope });
      if (!mounted.current || !sameAccount() || !valid()) return;
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
    },
    [scope, client, refresh, sameAccount],
  );

  const recover = useCallback(
    async (action: PendingKitchenAction) => {
      if (!isLive() || operations.current.has(action.orderId) || !sameAccount()) return;
      const controller = new AbortController();
      operations.current.set(action.orderId, controller);
      const generation = epoch.current;
      const current = () =>
        mounted.current &&
        generation === epoch.current &&
        !controller.signal.aborted &&
        sameAccount();
      setBusy((ids) => [...ids, action.orderId]);
      try {
        const order = await readKitchenOrder(action.orderId, withTimeout(controller.signal));
        if (!current()) return;
        if (order.sessionId !== action.sessionId) throw new Error("Invalid recovery session");
        await acceptOrder(order, current);
        if (!current()) return;
        forget(action.orderId);
        const result = recoveryOutcome(
          action,
          order.items.find((i) => i.id === action.itemId)?.status,
        );
        setNotice(m.recovered(c.table(order.tableLabel), result));
        setError("");
      } catch (e) {
        if (!current()) return;
        if (
          e instanceof ApiError &&
          (e.code === "SESSION_CLOSED" || e.code === "ORDER_NOT_FOUND")
        ) {
          forget(action.orderId);
          setNotice(m.recoveryClosed);
          void refresh();
        } else setError(errorMessage(e, m.recoveryUnknown, language));
      } finally {
        if (operations.current.get(action.orderId) === controller)
          operations.current.delete(action.orderId);
        if (mounted.current && generation === epoch.current)
          setBusy((ids) => ids.filter((id) => id !== action.orderId));
      }
    },
    [acceptOrder, forget, refresh, sameAccount, m, c, language],
  );
  const recoveryRef = useRef(recover);
  useEffect(() => {
    recoveryRef.current = recover;
  }, [recover]);

  useEffect(() => {
    mounted.current = true;
    const controllers = operations.current;
    const check = () => {
      epoch.current++;
      baseline.current = null;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      setBusy([]);
      setWriting([]);
      const online = isLive();
      setActive(online);
      setResumeAfter(Date.now());
      setNow(Date.now());
      void client.cancelQueries({ queryKey: scope }).then(() => {
        if (mounted.current && online && sameAccount())
          void client.invalidateQueries({ queryKey: scope });
      });
    };
    const recoverPending = () => {
      if (isLive()) for (const action of pendingRef.current) void recoveryRef.current(action);
    };
    const initial = window.setTimeout(recoverPending, 0);
    const recoveryTimer = window.setInterval(recoverPending, 10_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const stopListening = onLifecycleChange(() => {
      check();
      recoverPending();
    });
    return () => {
      mounted.current = false;
      // epoch is an operation generation counter, not a DOM ref: invalidate all work from this mount.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      controllers.forEach((c) => c.abort());
      controllers.clear();
      baseline.current = null;
      window.clearTimeout(initial);
      window.clearInterval(recoveryTimer);
      window.clearInterval(tick);
      stopListening();
      void client.cancelQueries({ queryKey: scope });
      if (!sameAccount()) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Identity-scoped memory is also discarded. */
        }
      }
    };
  }, [scope, client, sameAccount, storageKey]);

  useEffect(() => {
    if (!head || !active || head.receivedAt < resumeAfter) return;
    // The created count is restaurant-wide, so the polls of every tab share one baseline. A cached tab's
    // older head, or another loaded page, is not a new poll.
    if (baseline.current && head.receivedAt <= baseline.current.at) return;
    const result = arrivals(baseline.current, head.createdOrderCount, head.receivedAt);
    baseline.current = result.baseline;
    if (result.added > 0) {
      // Server arrivals are an external event, announced even when audio is disabled.
      setNotice(m.arrivals(result.added, head.pendingCount));
      play();
    }
  }, [head, active, resumeAfter, play, m]);

  async function perform(order: KitchenOrder, item: OrderLine, kind: "ready" | "cancel") {
    if (
      !fresh ||
      operations.current.has(order.id) ||
      pendingRef.current.some((p) => p.orderId === order.id) ||
      item.status !== "NEW" ||
      !sameAccount()
    )
      return;
    const action: PendingKitchenAction = {
      orderId: order.id,
      sessionId: order.sessionId,
      kind,
      itemId: item.id,
    };
    const controller = new AbortController();
    operations.current.set(order.id, controller);
    const generation = epoch.current;
    const current = () =>
      mounted.current &&
      generation === epoch.current &&
      !controller.signal.aborted &&
      sameAccount();
    setBusy((ids) => [...ids, order.id]);
    setWriting((ids) => [...ids, order.id]);
    remember([...pendingRef.current, action]);
    try {
      const signal = withTimeout(controller.signal);
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
      forget(order.id);
      // Feedback is replaced when the result arrives, not cleared on tap, so it does not flicker.
      setError("");
      const dish = displayName(item, order.defaultLanguage, language).text;
      setNotice(m.done(`${c.table(result.tableLabel)} · ${dish} ×${item.quantity}`, kind));
      return result;
    } catch (e) {
      if (!current()) return;
      setNotice("");
      if (e instanceof ApiError && e.status < 500) {
        forget(order.id);
        setError(errorMessage(e, undefined, language));
        if (e.status === 409) {
          // A cancellation confirmation cannot survive the target item becoming terminal.
          try {
            const updated = await readKitchenOrder(order.id, withTimeout(controller.signal));
            if (current()) await acceptOrder(updated, current);
          } catch {
            if (current()) void refresh();
          }
        }
      } else setError(m.writeUnknown);
    } finally {
      if (operations.current.get(order.id) === controller) operations.current.delete(order.id);
      if (mounted.current && generation === epoch.current) {
        setBusy((ids) => ids.filter((id) => id !== order.id));
        setWriting((ids) => ids.filter((id) => id !== order.id));
      }
    }
  }

  const orders = uniqueBy(
    (query.data?.pages ?? []).flatMap((page) => page.items),
    (order) => order.id,
  ).filter((order) => order.status === status);
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
    orders,
    dishes: view === "DISHES" ? dishGroups(orders) : [],
    head,
    summary,
    fresh,
    stalled,
    active,
    now,
    notice,
    error,
    busy,
    // Each marker is persisted before its POST, but shown only once the result is unknown (a failed or
    // timed-out request, or a reload); while the request is in flight only its ticket is locked.
    pending: pending.filter((p) => !writing.includes(p.orderId)),
    storageWarning,
    ...sound,
    latest,
    perform,
    recover,
    refresh,
  };
}
