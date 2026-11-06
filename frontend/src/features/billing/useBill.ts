import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { sessionQuery } from "@/features/dining/api";
import { syncIsFresh, syncIsStalled } from "@/lib/live-view";
import { ApiError } from "@/lib/api";
import { invalidateStoreViews } from "@/lib/store-views";
import { useLiveView } from "@/lib/useLiveView";
import { uniqueBy } from "@/lib/utils";
import { billingKey, readBill } from "./api";

export function useBill(account: CurrentAccount, id: string, history = false) {
  const client = useQueryClient();
  const view = useLiveView();
  // Callers mount one panel per selected bill, so this is when the bill was opened.
  const [openedAt] = useState(Date.now);
  const key = useMemo(
    () => [...billingKey(account), history ? "closed" : "active", id],
    [account, history, id],
  );
  const session = useQuery({
    ...sessionQuery(account, id),
    enabled: !history && !!id && view.active,
    refetchInterval: view.active ? 30_000 : false,
  });
  const closed = !history && session.data?.status === "CLOSED";
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readBill(id, history, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!id && view.active && (history || session.data?.status === "ACTIVE"),
    refetchInterval: view.active && !history && !closed ? 30_000 : false,
  });
  const refresh = useCallback(async () => {
    if (!history) {
      await client.invalidateQueries({ queryKey: sessionQuery(account, id).queryKey });
      invalidateStoreViews(client, account, ["floor"]);
    }
    await client.invalidateQueries({ queryKey: key });
  }, [account, client, history, id, key]);
  useEffect(() => {
    let alive = true;
    void client.cancelQueries({ queryKey: key }).then(() => {
      if (alive && view.active) void refresh();
    });
    return () => {
      alive = false;
      void client.cancelQueries({ queryKey: key });
    };
  }, [view.active, view.resumeAfter, client, key, refresh]);
  useEffect(() => {
    if (!(query.error instanceof ApiError)) return;
    if (query.error.code === "BILL_CHANGED") void client.resetQueries({ queryKey: key });
    if (query.error.code === "SESSION_CLOSED")
      void client.invalidateQueries({ queryKey: sessionQuery(account, id).queryKey });
  }, [query.error, client, key, account, id]);
  useEffect(() => {
    if (closed) {
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
    }
  }, [closed, client, key]);
  const head = query.data?.pages[0];
  const fresh =
    !closed &&
    !session.isError &&
    syncIsFresh(head?.receivedAt ?? 0, view.now, view.resumeAfter, view.active, query.isError);
  // Opening a bill reads its session and then its orders; only a wait beyond the grace is reported.
  const stalled =
    !closed &&
    syncIsStalled(
      fresh,
      view.now,
      Math.max(view.resumeAfter, openedAt),
      view.active,
      query.isError || session.isError,
    );
  const orders = uniqueBy(
    (query.data?.pages ?? []).flatMap((p) => p.orders),
    (o) => o.id,
  );
  return { query, session, closed, head, orders, fresh, stalled, view, refresh };
}
