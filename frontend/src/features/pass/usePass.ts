import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { passChime } from "@/lib/alert-sound";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { displayName } from "@/lib/language";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { useAlertSound } from "@/lib/useAlertSound";
import { onLifecycleChange, useLiveView } from "@/lib/useLiveView";
import { uniqueBy } from "@/lib/utils";
import { markServed, passKey, readPass, type PassItem, type PassPage } from "./api";
import { groupByTable, readyArrived, type ReadyBaseline } from "./state";

// Codes meaning another device or a closure got there first: the list, not this tap, is the truth.
const settled = new Set([
  "ORDER_ITEM_CHANGED",
  "ORDER_ITEM_NOT_FOUND",
  "SESSION_CLOSED",
  "SESSION_NOT_FOUND",
]);

export function usePass(account: CurrentAccount) {
  const client = useQueryClient();
  const view = useLiveView();
  const [openedAt] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const { restaurantId, userId, role } = account;
  const key = useMemo(() => passKey({ restaurantId, userId }), [restaurantId, userId]);
  const { play, ...sound } = useAlertSound("tavoloflow:pass-sound", passChime);
  const mounted = useRef(false);
  const operations = useRef(new Map<string, AbortController>());
  const baseline = useRef<ReadyBaseline>(null);
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readPass(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: view.active,
    refetchInterval: view.active ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const head = query.data?.pages[0];
  const fresh = syncIsFresh(
    head?.receivedAt ?? 0,
    view.now,
    view.resumeAfter,
    view.active,
    query.isError,
  );
  const stalled = syncIsStalled(
    fresh,
    view.now,
    Math.max(view.resumeAfter, openedAt),
    view.active,
    query.isError,
  );

  const sameAccount = useCallback(
    () => isSameAccount(client, { restaurantId, userId, role }),
    [client, restaurantId, userId, role],
  );
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: key }), [client, key]);

  useEffect(() => {
    mounted.current = true;
    const controllers = operations.current;
    // Late write responses are discarded on lifecycle changes; the refreshed list shows what happened.
    const stop = onLifecycleChange(() => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      setBusy([]);
    });
    return () => {
      mounted.current = false;
      stop();
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      void client.cancelQueries({ queryKey: key });
    };
  }, [client, key]);

  useEffect(() => {
    let alive = true;
    baseline.current = null;
    void client.cancelQueries({ queryKey: key }).then(() => {
      if (alive && view.active) void refresh();
    });
    return () => {
      alive = false;
    };
  }, [view.active, view.resumeAfter, client, key, refresh]);

  useEffect(() => {
    if (!head || !view.active || head.receivedAt < view.resumeAfter) return;
    // Removing a served dish from the cache, or loading another page, is not a new poll.
    if (baseline.current && head.receivedAt <= baseline.current.at) return;
    const result = readyArrived(baseline.current, head.latestReadyAt, head.receivedAt);
    baseline.current = result.baseline;
    if (result.arrived) {
      // Server arrivals are an external event, announced even when audio is disabled.
      setNotice(`有新的菜品出餐；当前待送 ${head.totalCount} 道。`);
      play();
    }
  }, [head, view.active, view.resumeAfter, play]);

  // No pending marker is persisted: the write only applies to a READY dish not yet served, so a repeat
  // is harmless, and the list itself answers whether a lost request went through.
  async function serve(item: PassItem) {
    if (!fresh || operations.current.has(item.id) || !sameAccount()) return;
    const controller = new AbortController();
    operations.current.set(item.id, controller);
    const current = () => mounted.current && !controller.signal.aborted && sameAccount();
    const label = `${item.tableLabel} 桌 · ${displayName(item, item.defaultLanguage, "zh").text} ×${item.quantity}`;
    setBusy((ids) => [...ids, item.id]);
    try {
      await markServed(item, withTimeout(controller.signal));
      if (!current()) return;
      // Stop older list reads that could still contain the dish before removing it.
      await client.cancelQueries({ queryKey: key });
      if (!current()) return;
      client.setQueryData<InfiniteData<PassPage>>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((i) => i.id !== item.id),
              })),
            }
          : data,
      );
      setError("");
      setNotice(`${label}：已送达。`);
      void refresh();
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && settled.has(e.code)) {
        setError("");
        setNotice(`${label}：已由其他设备处理或该桌已结账，列表已更新。`);
      } else {
        setNotice("");
        setError(
          errorMessage(e, `${label}：结果未能确认。列表刷新后，若菜品仍在，请再点一次「已送达」。`),
        );
      }
      void refresh();
    } finally {
      if (operations.current.get(item.id) === controller) operations.current.delete(item.id);
      if (mounted.current) setBusy((ids) => ids.filter((id) => id !== item.id));
    }
  }

  const items = uniqueBy(
    (query.data?.pages ?? []).flatMap((page) => page.items),
    (item) => item.id,
  );
  return {
    query,
    head,
    items,
    tables: groupByTable(items),
    fresh,
    stalled,
    view,
    notice,
    error,
    busy,
    serve,
    refresh,
    ...sound,
  };
}
