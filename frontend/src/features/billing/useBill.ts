import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { sessionQuery } from "@/features/dining/api";
import { syncIsFresh } from "@/features/kitchen/state";
import { ApiError } from "@/lib/api";
import { billingKey, readBill } from "./api";

export const available = () => navigator.onLine && document.visibilityState === "visible";
export function useLiveView() {
  const [active, setActive] = useState(available);
  const [resumeAfter, setResumeAfter] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const check = () => { setActive(available()); setResumeAfter(Date.now()); setNow(Date.now()); };
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("online", check); window.addEventListener("offline", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(tick); window.removeEventListener("online", check); window.removeEventListener("offline", check);
      document.removeEventListener("visibilitychange", check); };
  }, []);
  return { active, resumeAfter, now };
}

export function useBill(account: CurrentAccount, id: string, history = false) {
  const client = useQueryClient();
  const view = useLiveView();
  const key = useMemo(() => [...billingKey(account), history ? "closed" : "active", id], [account, history, id]);
  const session = useQuery({ ...sessionQuery(account, id), enabled: !history && !!id && view.active,
    refetchInterval: view.active ? 30_000 : false });
  const closed = !history && session.data?.status === "CLOSED";
  const query = useInfiniteQuery({ queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readBill(id, history, pageParam, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: !!id && view.active && (history || session.data?.status === "ACTIVE"),
    refetchInterval: view.active && !history && !closed ? 30_000 : false,
  });
  const refresh = useCallback(async () => {
    if (!history) {
      await client.invalidateQueries({ queryKey: sessionQuery(account, id).queryKey });
      void client.invalidateQueries({ queryKey: ["floor", account.restaurantId, account.userId] });
    }
    await client.invalidateQueries({ queryKey: key });
  }, [account, client, history, id, key]);
  useEffect(() => {
    let alive = true;
    void client.cancelQueries({ queryKey: key }).then(() => { if (alive && view.active) void refresh(); });
    return () => { alive = false; void client.cancelQueries({ queryKey: key }); };
  }, [view.active, view.resumeAfter, client, key, refresh]);
  useEffect(() => {
    if (!(query.error instanceof ApiError)) return;
    if (query.error.code === "BILL_CHANGED") void client.resetQueries({ queryKey: key });
    if (query.error.code === "SESSION_CLOSED") void client.invalidateQueries({ queryKey: sessionQuery(account, id).queryKey });
  }, [query.error, client, key, account, id]);
  useEffect(() => {
    if (closed) { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); }
  }, [closed, client, key]);
  const head = query.data?.pages[0];
  const fresh = !closed && !session.isError && syncIsFresh(head?.receivedAt ?? 0, view.now, view.resumeAfter, view.active, query.isError);
  const orders = [...new Map((query.data?.pages ?? []).flatMap(p => p.orders).map(o => [o.id, o])).values()];
  return { query, session, closed, head, orders, fresh, view, refresh };
}
