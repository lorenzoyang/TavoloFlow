import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveView } from "@/lib/useLiveView";
import { pickupOrderQuery } from "./api";
import { statusView } from "./state";

// Both the status page and the menu's ongoing-order notice follow the same live status. A failed
// initial read keeps polling; a confirmed 404 or a finished order stops the interval.
export function usePickupOrder(token: string | null) {
  const client = useQueryClient();
  const view = useLiveView();
  const options = useMemo(() => pickupOrderQuery(token ?? ""), [token]);
  const query = useQuery({
    ...options,
    enabled: !!token && view.active,
    refetchInterval: (q) =>
      !token ||
      !view.active ||
      q.state.data === null ||
      (q.state.data && statusView(q.state.data.status, q.state.data.rejectReason).finished)
        ? false
        : 10_000,
  });
  useEffect(() => {
    let alive = true;
    void client.cancelQueries({ queryKey: options.queryKey }).then(() => {
      if (alive && token && view.active)
        void client.invalidateQueries({ queryKey: options.queryKey });
    });
    return () => {
      alive = false;
    };
  }, [client, options, token, view.active, view.resumeAfter]);
  return { query, view, stale: query.isError || query.fetchStatus === "paused" || !view.active };
}
