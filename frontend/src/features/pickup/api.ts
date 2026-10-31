import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import type { Language } from "@/lib/language";
import type { PickupHour } from "./state";

export type PickupStatus = "OPEN" | "PAUSED" | "CLOSED_HOURS" | "NOT_OFFERED" | "SUSPENDED";
export type PickupSettings = {
  pickupEnabled: boolean;
  slug: string | null;
  phone: string | null;
  paused: boolean;
  hours: PickupHour[];
  status: PickupStatus;
  // Set while CLOSED_HOURS when an opening falls within seven days.
  nextOpensAt: string | null;
  timeZone: string;
};

// Store-private pickup data: settings, the pending requests and today's unaccepted ones.
export const pickupKey = (account: AccountScope) =>
  ["pickup", account.restaurantId, account.userId] as const;
export const pickupSettingsQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: [...pickupKey(account), "settings"] as const,
    queryFn: ({ signal }) => request<PickupSettings>("/api/staff/pickup/settings", { signal }),
    refetchInterval: 60_000,
  });

// Both writes send the target state, so repeating one after a lost result is harmless.
export const setPickupPaused = (paused: boolean) =>
  write<PickupSettings>("/api/staff/pickup/paused", "PATCH", { paused });
export const savePickupHours = (hours: PickupHour[]) =>
  write<PickupSettings>("/api/owner/pickup/hours", "PUT", { hours });

export const onlineMenuPath = (slug: string) => `/r/${slug}`;

export type PickupLine = {
  itemCode: string | null;
  nameZh: string | null;
  nameIt: string | null;
  nameEn: string | null;
  quantity: number;
  remark: string | null;
  unitPriceCents: number;
};
export type PendingPickup = {
  id: string;
  pickupNumber: number;
  customerName: string;
  customerPhone: string;
  submittedAt: string;
  expiresAt: string;
  defaultLanguage: Language;
  totalAmountCents: number;
  items: PickupLine[];
};
export type RejectReason = "SOLD_OUT" | "BUSY" | "CLOSING";
export type UnacceptedPickup = {
  pickupNumber: number;
  customerName: string;
  customerPhone: string;
  submittedAt: string;
  totalAmountCents: number;
  outcome: "EXPIRED" | "REJECTED";
  rejectReason: RejectReason | null;
};

// Every waiting request, oldest first; at most `limit` wait at once, so the list is never paged.
export const pendingPickupsQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: [...pickupKey(account), "pending"] as const,
    queryFn: ({ signal }) =>
      request<{ items: PendingPickup[]; limit: number }>("/api/staff/pickup/pending", { signal }),
  });
export const unacceptedPickupsQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: [...pickupKey(account), "unaccepted"] as const,
    queryFn: ({ signal }) =>
      request<{ items: UnacceptedPickup[]; businessDate: string }>("/api/staff/pickup/unaccepted", {
        signal,
      }),
    refetchInterval: 60_000,
  });

// Both decisions apply only to a request still waiting; a repeat or a lost race returns PICKUP_CHANGED,
// and the refreshed pending list shows whether a lost write went through. Nothing is persisted first.
export const acceptPickup = (id: string, estimatedMinutes: number, signal: AbortSignal) =>
  write<{ sessionId: string; pickupNumber: number; estimatedReadyAt: string }>(
    `/api/staff/pickup/requests/${id}/accept`,
    "POST",
    { estimatedMinutes },
    signal,
  );
export const rejectPickup = (id: string, reason: RejectReason | null, signal: AbortSignal) =>
  write<void>(`/api/staff/pickup/requests/${id}/reject`, "POST", { reason }, signal);
