import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { diningKey } from "@/features/dining/api";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { syncIsFresh } from "@/lib/live-view";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { uniqueBy } from "@/lib/utils";
import {
  cancelOrder,
  kitchenKey,
  markReady,
  readKitchen,
  readKitchenOrder,
  type KitchenOrder,
  type KitchenPage,
} from "./api";
import { KitchenAudio } from "./audio";
import {
  arrivals,
  pendingKitchenKey,
  readPending,
  recoveryOutcome,
  type ArrivalBaseline,
  type OrderStatus,
  type PendingKitchenAction,
} from "./state";

export function useKitchen(account: CurrentAccount) {
  const client = useQueryClient();
  const [status, setStatus] = useState<OrderStatus>("NEW");
  const [active, setActive] = useState(isLive);
  const [resumeAfter, setResumeAfter] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
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
  const audio = useRef<KitchenAudio | null>(null);
  const soundOn = useRef(false);
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
        await acceptOrder(order, current);
        if (!current()) return;
        forget(action.orderId);
        const result = recoveryOutcome(action, order.status);
        setNotice(
          `${order.tableLabel} 桌：${result === "reached" ? "已核对当前状态，操作目标已达到。" : result === "changed" ? "订单已被处理，请查看最新状态。" : "订单仍为原状态；如需处理，请重新核对并确认。"}`,
        );
        setError("");
      } catch (e) {
        if (!current()) return;
        if (
          e instanceof ApiError &&
          (e.code === "SESSION_CLOSED" || e.code === "ORDER_NOT_FOUND")
        ) {
          forget(action.orderId);
          setNotice("原订单已结束用餐或已不可访问，请由老板核对。不会重新发送操作。");
          void refresh();
        } else setError(errorMessage(e, "结果仍待确认，请恢复连接后核对原订单。"));
      } finally {
        if (operations.current.get(action.orderId) === controller)
          operations.current.delete(action.orderId);
        if (mounted.current && generation === epoch.current)
          setBusy((ids) => ids.filter((id) => id !== action.orderId));
      }
    },
    [acceptOrder, forget, refresh, sameAccount],
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
      audio.current?.close();
      audio.current = null;
      soundOn.current = false;
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
    if (baseline.current?.at === head.receivedAt) return; // Loading another page is not a fresh head poll.
    const result = arrivals(baseline.current, head.createdOrderCount, head.receivedAt);
    baseline.current = result.baseline;
    if (result.added > 0) {
      // Server arrivals are an external event, announced even when audio is disabled.
      setNotice(`收到 ${result.added} 笔新订单；当前待处理 ${head.pendingCount} 笔。`);
      if (soundOn.current) {
        try {
          audio.current?.play();
        } catch {
          soundOn.current = false;
          setSound(false);
          setSoundError("声音暂不可用，请点击重新开启；订单仍会正常更新。");
        }
      }
    }
  }, [head, active, resumeAfter]);

  async function toggleSound() {
    if (soundOn.current) {
      soundOn.current = false;
      setSound(false);
      return;
    }
    const generation = epoch.current;
    try {
      audio.current ??= new KitchenAudio();
      await audio.current.enable();
      if (!mounted.current || generation !== epoch.current || !sameAccount()) return;
      baseline.current = null;
      soundOn.current = true;
      setSound(true);
      setSoundError("");
    } catch {
      if (mounted.current) {
        setSoundError("此浏览器未能开启声音，请检查声音权限或使用其他浏览器。");
        setSound(false);
      }
    }
  }

  async function perform(order: KitchenOrder, kind: "ready" | "cancel", reason?: string) {
    if (
      !fresh ||
      operations.current.has(order.id) ||
      pendingRef.current.some((p) => p.orderId === order.id) ||
      order.status === "CANCELLED" ||
      !sameAccount()
    )
      return;
    const action: PendingKitchenAction = {
      orderId: order.id,
      sessionId: order.sessionId,
      kind,
      expectedStatus: order.status,
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
    remember([...pendingRef.current, action]);
    setError("");
    setNotice("");
    try {
      const signal = withTimeout(controller.signal);
      const result =
        kind === "cancel"
          ? await cancelOrder(order.id, order.status, reason?.trim() ?? "", signal)
          : await markReady(order.id, signal);
      if (!current()) return;
      await acceptOrder(result, current);
      if (!current()) return;
      forget(order.id);
      setNotice(
        `${result.tableLabel} 桌：${kind === "ready" ? "整单已完成。" : "整单已取消，账单金额已更新。"}`,
      );
      return result;
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && e.status < 500) {
        forget(order.id);
        setError(errorMessage(e));
        if (e.status === 409) {
          // The original confirmation must not be silently promoted from NEW cancellation to READY voiding.
          try {
            const updated = await readKitchenOrder(order.id, withTimeout(controller.signal));
            if (current()) await acceptOrder(updated, current);
          } catch {
            if (current()) void refresh();
          }
        }
      } else setError("操作结果待确认。请核对原订单，系统不会自动重新提交。");
    } finally {
      if (operations.current.get(order.id) === controller) operations.current.delete(order.id);
      if (mounted.current && generation === epoch.current)
        setBusy((ids) => ids.filter((id) => id !== order.id));
    }
  }

  const orders = uniqueBy(
    (query.data?.pages ?? []).flatMap((page) => page.items),
    (order) => order.id,
  ).filter((order) => order.status === status);
  return {
    status,
    setStatus: (next: OrderStatus) => {
      if (next === status) return;
      baseline.current = null;
      setResumeAfter(Date.now());
      setStatus(next);
      setError("");
    },
    query,
    orders,
    head,
    fresh,
    active,
    now,
    notice,
    error,
    busy,
    pending,
    storageWarning,
    sound,
    soundError,
    latest,
    toggleSound,
    perform,
    recover,
    refresh,
  };
}
