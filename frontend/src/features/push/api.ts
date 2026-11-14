import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import type { PushSubscriptionBody } from "./state";

// The server's VAPID public key; null while the server has push turned off.
export const pushKeyQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: ["push-key", account.restaurantId, account.userId] as const,
    queryFn: ({ signal }) =>
      request<{ publicKey: string | null }>("/api/staff/push/key", { signal }),
    staleTime: 5 * 60_000,
  });

// Both writes are idempotent, so nothing is persisted before them: a lost result is settled by the
// next registration or by the push service dropping the endpoint.
export const savePushSubscription = (body: PushSubscriptionBody, signal: AbortSignal) =>
  write<void>("/api/staff/push/subscription", "PUT", body, signal);

export const removePushSubscription = (endpoint: string, signal: AbortSignal) =>
  write<void>("/api/staff/push/subscription", "DELETE", { endpoint }, signal);
