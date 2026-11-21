import type { AccountScope } from "@/features/accounts/api";
import { platformRequest, platformWrite, request, withTimeout, write } from "@/lib/api";
import type { PeriodInput, SubscriptionDetail, SubscriptionNotice } from "./state";

export const ownerSubscriptionKey = (account: AccountScope) =>
  ["subscription", account.restaurantId, account.userId] as const;
export const platformSubscriptionKey = (userId: string, restaurantId: string) =>
  ["platform", "subscription", userId, restaurantId] as const;
export const subscriptionRemindersKey = (userId: string) =>
  ["platform", "subscription-reminders", userId] as const;

// Reads and writes return the summary with every period, both from one snapshot.
const subscriptionBase = (id: string) => `/api/platform/restaurants/${id}/subscription`;
export const getSubscription = (id: string, signal: AbortSignal) =>
  platformRequest<SubscriptionDetail>(subscriptionBase(id), { signal });
export const getOwnerSubscription = (signal: AbortSignal) =>
  request<SubscriptionDetail>("/api/owner/subscription", { signal });
export const saveSubscription = (
  id: string,
  input: {
    expectedVersion: number;
    ownerContact: string | null;
    defaultMonthlyFeeCents: number | null;
  },
  signal: AbortSignal,
) => platformWrite<SubscriptionDetail>(subscriptionBase(id), "PATCH", input, withTimeout(signal));
export const createPeriod = (
  id: string,
  input: PeriodInput & { expectedVersion: number },
  signal: AbortSignal,
) =>
  platformWrite<SubscriptionDetail>(
    `${subscriptionBase(id)}/periods`,
    "POST",
    input,
    withTimeout(signal),
  );
export const editPeriod = (
  id: string,
  periodId: string,
  input: Omit<PeriodInput, "id" | "paidOn"> & { expectedVersion: number },
  signal: AbortSignal,
) =>
  platformWrite<SubscriptionDetail>(
    `${subscriptionBase(id)}/periods/${periodId}`,
    "PATCH",
    input,
    withTimeout(signal),
  );
export const confirmPayment = (
  id: string,
  periodId: string,
  input: { expectedVersion: number; paidOn: string; reason: string | null },
  signal: AbortSignal,
) =>
  platformWrite<SubscriptionDetail>(
    `${subscriptionBase(id)}/periods/${periodId}/payment`,
    "POST",
    input,
    withTimeout(signal),
  );
export const getReminders = (signal: AbortSignal) =>
  platformRequest<{
    dueSoonCount: number;
    expiredCount: number;
    unpaidCount: number;
  }>("/api/platform/subscription-reminders", { signal });

const ownerNoticesPath = "/api/owner/subscription/notices";
const platformNoticesPath = "/api/platform/subscription-notices";

export const readOwnerNotices = (signal: AbortSignal) =>
  request<SubscriptionNotice[]>(ownerNoticesPath, { signal });

export const readPlatformNotices = (signal: AbortSignal) =>
  platformRequest<SubscriptionNotice[]>(platformNoticesPath, { signal });

export const acknowledgeOwnerNotices = (ids: string[], signal: AbortSignal) =>
  write<void>(`${ownerNoticesPath}/acknowledge`, "POST", { ids }, withTimeout(signal));

export const acknowledgePlatformNotices = (ids: string[], signal: AbortSignal) =>
  platformWrite<void>(`${platformNoticesPath}/acknowledge`, "POST", { ids }, withTimeout(signal));
