import type { QueryClient } from "@tanstack/react-query";

// Store pages whose cached data a service write can change. Each feature's api.ts builds its key
// factory from storeKey, so other features can refresh a view without importing that feature.
export type StoreView = "kitchen" | "pass" | "floor" | "dining" | "billing" | "history" | "tables";

type Scope = { restaurantId: string; userId: string };

export const storeKey = <V extends StoreView>(view: V, account: Scope) =>
  [view, account.restaurantId, account.userId] as const;

// Marks the views stale; those on screen refetch at once, the others when they next mount.
export function invalidateStoreViews(client: QueryClient, account: Scope, views: StoreView[]) {
  for (const view of views) void client.invalidateQueries({ queryKey: storeKey(view, account) });
}
