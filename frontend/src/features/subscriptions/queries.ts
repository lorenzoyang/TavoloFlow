import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { syncIsFresh } from "@/lib/live-view";
import { isLive, onLifecycleChange, useLiveView } from "@/lib/useLiveView";

export function useSubscriptionQuery<T>(
  queryKey: QueryKey,
  queryFn: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const client = useQueryClient();
  const live = useLiveView();
  const key = JSON.stringify(queryKey);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    enabled: enabled && live.active,
    refetchInterval: live.active ? 60_000 : false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  useEffect(
    () =>
      onLifecycleChange(() => {
        const queryKey = JSON.parse(key) as QueryKey;
        if (!isLive()) void client.cancelQueries({ queryKey });
        else if (enabled) void client.invalidateQueries({ queryKey });
      }),
    [client, key, enabled],
  );
  return {
    ...query,
    // 60-second polling, so a view stays fresh for 90 seconds rather than the default 30.
    stale: !syncIsFresh(
      query.dataUpdatedAt,
      live.now,
      live.resumeAfter,
      live.active,
      query.isError,
      90_000,
    ),
  };
}
