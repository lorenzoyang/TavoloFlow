import type { AppScope } from "@/features/accounts/useInstallApp";
import { platformRequest, platformWrite, request, write } from "@/lib/api";
import type { PushSubscriptionBody } from "./state";

// The server's VAPID public key; null while the server has push turned off.
export const readPushKey = (scope: AppScope, signal: AbortSignal) =>
  scope === "/platform"
    ? platformRequest<{ publicKey: string | null }>("/api/platform/push/key", { signal })
    : request<{ publicKey: string | null }>("/api/staff/push/key", { signal });

// Both writes are idempotent, so nothing is persisted before them: a lost result is settled by the
// next registration or by the push service dropping the endpoint.
export const savePushSubscription = (body: PushSubscriptionBody, signal: AbortSignal) =>
  write<void>("/api/staff/push/subscription", "PUT", body, signal);

export const removePushSubscription = (endpoint: string, signal: AbortSignal) =>
  write<void>("/api/staff/push/subscription", "DELETE", { endpoint }, signal);

export const savePlatformDevice = (body: PushSubscriptionBody, signal: AbortSignal) =>
  platformWrite<void>("/api/platform/push/subscription", "PUT", body, signal);

export const removePlatformDevice = (endpoint: string, signal: AbortSignal) =>
  platformWrite<void>("/api/platform/push/subscription", "DELETE", { endpoint }, signal);
