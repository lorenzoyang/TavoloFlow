import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import { storeKey } from "@/lib/store-views";
import type { CouponDiscount, OnlineOrder } from "@/features/online-order/api";
import type { Language } from "@/lib/language";
import type {
  CouponInput,
  DeliveryInput,
  DeliverySettings,
  OnlineCoupon,
  OnlineHour,
  RejectReason,
} from "./state";

// The server's single "can customers order online now" rule (OnlineAvailability).
export type OnlineStatus =
  "OPEN" | "BUSY" | "PAUSED" | "CLOSED_HOURS" | "NOT_OFFERED" | "SUSPENDED";

export type OnlineSettings = {
  slug: string | null;
  publicPhone: string | null;
  hours: OnlineHour[];
  // Null once the pause has lapsed.
  pausedUntil: string | null;
  status: OnlineStatus;
  // Only with CLOSED_HOURS, and null when the week has no slots.
  nextOpensAt: string | null;
  // Set while a slot accepts orders: "pause until the end of this slot" ends then.
  currentSlotEndsAt: string | null;
  // Ordered by code.
  coupons: OnlineCoupon[];
} & DeliverySettings;

export const onlineSettingsKey = (account: AccountScope) => storeKey("online-settings", account);

// The state changes with the clock (slots open and close, pauses lapse), so the visible page rereads it.
export const onlineSettingsQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: onlineSettingsKey(account),
    queryFn: ({ signal }) => request<OnlineSettings>("/api/staff/online/settings", { signal }),
    refetchInterval: 60_000,
  });

export const onlinePath = (slug: string) => `/r/${slug}`;

// Every write sends its target and returns the fresh settings; a repeated request leaves the same state.
export const pauseOnline = (until: "SLOT" | "TODAY", signal?: AbortSignal) =>
  write<OnlineSettings>("/api/staff/online/pause", "PUT", { until }, signal);
export const resumeOnline = (signal?: AbortSignal) =>
  write<OnlineSettings>("/api/staff/online/pause", "DELETE", undefined, signal);
export const saveOnlineHours = (slots: OnlineHour[], signal?: AbortSignal) =>
  write<OnlineSettings>("/api/owner/online/hours", "PUT", { slots }, signal);
export const savePublicPhone = (publicPhone: string | null, signal?: AbortSignal) =>
  write<OnlineSettings>("/api/owner/online/phone", "PATCH", { publicPhone }, signal);
export const saveDelivery = (input: DeliveryInput, signal?: AbortSignal) =>
  write<OnlineSettings>("/api/owner/online/delivery", "PUT", input, signal);
// A repeated create meets COUPON_CODE_TAKEN, and deleting a coupon that is gone still succeeds.
export const createCoupon = (input: CouponInput, signal?: AbortSignal) =>
  write<OnlineSettings>("/api/owner/online/coupons", "POST", input, signal);
export const deleteCoupon = (id: string, signal?: AbortSignal) =>
  write<OnlineSettings>(`/api/owner/online/coupons/${id}`, "DELETE", undefined, signal);

// Online requests waiting for staff, oldest first. Now is the server's clock when it answered, so the
// page counts the ten minutes on the server's time rather than the device's.
export type OnlinePendingRequest = {
  id: string;
  number: number;
  fulfillment: "PICKUP" | "DELIVERY";
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  submittedAt: string;
  expiresAt: string;
  defaultLanguage: Language;
  // The submitted snapshot (status null), the same lines as the customer's status page.
  items: OnlineOrder["items"];
  // Before the coupon; its discount comes off this, and acceptance adds any delivery fee.
  itemsTotalCents: number;
  coupon: CouponDiscount | null;
};
export type OnlinePendingPage = { items: OnlinePendingRequest[]; now: string; receivedAt: number };

// An accepted online order until its session closes; counts are lines, not portions.
export type OnlineActiveOrder = {
  sessionId: string;
  number: number;
  channel: "PICKUP" | "DELIVERY";
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  acceptedAt: string;
  estimatedAt: string;
  itemCount: number;
  newItemCount: number;
  readyItemCount: number;
  coupon: CouponDiscount | null;
  // Delivery only. The total is the bill's amount to collect, with the fee while it counts and less the
  // coupon.
  deliveryFeeCents: number | null;
  totalAmountCents: number;
};

export const onlinePendingKey = (account: AccountScope) => storeKey("online-pending", account);
export const onlineActiveKey = (account: AccountScope) => storeKey("online-active", account);

// Shared by the banner on every staff page and the online orders page, so they poll once.
export const onlinePendingQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: onlinePendingKey(account),
    queryFn: async ({ signal }): Promise<OnlinePendingPage> => ({
      ...(await request<Omit<OnlinePendingPage, "receivedAt">>("/api/staff/online/pending", {
        signal,
      })),
      receivedAt: Date.now(),
    }),
  });
export const onlineActiveQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: onlineActiveKey(account),
    queryFn: ({ signal }) =>
      request<{ items: OnlineActiveOrder[] }>("/api/staff/online/active", { signal }),
  });

// Both apply only to a request still waiting; a repeat or a lost race returns ONLINE_REQUEST_CHANGED.
// Delivery sends the fee in cents (0 when free); pickup sends null.
export const acceptOnlineRequest = (
  id: string,
  estimatedMinutes: number,
  deliveryFeeCents: number | null,
  signal: AbortSignal,
) =>
  write<OnlineActiveOrder>(
    `/api/staff/online/requests/${id}/accept`,
    "POST",
    { estimatedMinutes, deliveryFeeCents },
    signal,
  );
export const rejectOnlineRequest = (id: string, reason: RejectReason | null, signal: AbortSignal) =>
  write<void>(`/api/staff/online/requests/${id}/reject`, "POST", { reason }, signal);
