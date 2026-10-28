import type { AccountScope } from "@/features/accounts/api";
import { platformRequest, platformWrite, request, withTimeout } from "@/lib/api";
import type { PeriodInput, SubscriptionDetail } from "./state";

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
    defaultAnnualFeeCents: number | null;
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
export const adjustExpiry = (
  id: string,
  periodId: string,
  input: { expectedVersion: number; endsOn: string },
  signal: AbortSignal,
) =>
  platformWrite<SubscriptionDetail>(
    `${subscriptionBase(id)}/periods/${periodId}/expiry`,
    "PATCH",
    input,
    withTimeout(signal),
  );
export const confirmPayment = (
  id: string,
  periodId: string,
  input: { expectedVersion: number; paidOn: string },
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
