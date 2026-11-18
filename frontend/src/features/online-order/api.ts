import { queryOptions, type Query } from "@tanstack/react-query";
import { ApiError, guestRequest, publicRequest, publicWrite, withTimeout } from "@/lib/api";
import type { Language, Names } from "@/lib/language";
import type { OptionSnapshot } from "@/lib/options";
import type { RestaurantTheme } from "@/lib/theme";
import type { OnlineStatus } from "@/features/online/api";
import type { DeliveryTier } from "@/features/online/state";
import type { PublicMenu } from "@/features/public-menu/api";
import type { OrderItemStatus } from "@/features/orders/api";
import { orderEnded, type OnlineIntent } from "./state";

export type { OnlineStatus };

// The anonymous online menu at /r/{slug}: the same menu as the QR page, plus whether customers can
// order now (the server's OnlineAvailability).
export type OnlineMenu = {
  restaurant: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: Language;
    theme: RestaurantTheme;
    publicPhone: string | null;
    // With delivery on, checkout offers it and shows the note in the customer's language.
    deliveryEnabled: boolean;
    deliveryNoteZh: string | null;
    deliveryNoteIt: string | null;
    deliveryNoteEn: string | null;
    // A delivery order's dishes, after the coupon, must reach it; null for no minimum.
    deliveryMinOrderCents: number | null;
    // The fee bands by road distance, nearest first; the last is the farthest the restaurant delivers.
    deliveryTiers: DeliveryTier[];
  };
  turnstile: { siteKey: string } | null;
  status: OnlineStatus;
  // Only with CLOSED_HOURS, and null when the week has no slots.
  nextOpensAt: string | null;
  menu: PublicMenu["menu"];
};

// The first submission and every repeat or recovery return the same values.
export type OnlineSubmission = { statusToken: string; number: number; expiresAt: string };
export type OnlineOrderingContext = { pending: OnlineSubmission | null };

// A coupon valid today at checkout, and the one an order used: discountCents is percentOff of the dishes
// still charged, rounded down (never the delivery fee). Staff pages and bills read the same shape.
export type CouponPreview = { code: string; percentOff: number };
export type CouponDiscount = CouponPreview & { discountCents: number };

export type OnlinePhase = "WAITING" | "EXPIRED" | "REJECTED" | "ACCEPTED";
export type RejectReason = "SOLD_OUT" | "BUSY" | "CLOSING" | "OUT_OF_RANGE";

// The customer's status page. Before acceptance the lines are the submitted snapshot (status null);
// afterwards they are the order items with the kitchen's progress.
export type OnlineOrder = {
  restaurant: {
    id: string;
    name: string;
    slug: string | null;
    currencyCode: string;
    defaultLanguage: Language;
    theme: RestaurantTheme;
    publicPhone: string | null;
  };
  number: number;
  customerName: string | null;
  fulfillment: "PICKUP" | "DELIVERY";
  submittedAt: string;
  expiresAt: string;
  phase: OnlinePhase;
  rejectReason: RejectReason | null;
  estimatedAt: string | null;
  sessionStatus: "ACTIVE" | "CLOSED" | null;
  closeReason: "PAID" | "VOIDED" | "NO_SHOW" | null;
  items: (Names & {
    itemCode: string | null;
    unitPriceCents: number;
    quantity: number;
    remark: string | null;
    options: OptionSnapshot[];
    status: OrderItemStatus | null;
  })[];
  coupon: CouponDiscount | null;
  // Set once a delivery is accepted; the total then includes it while any dish counts.
  deliveryFeeCents: number | null;
  // Already less the coupon.
  totalAmountCents: number;
};

// Both keys use the public prefix: they belong to no identity and survive staff sign-in and sign-out.
export const onlineMenuKey = (slug: string) => ["public", "online", slug] as const;
export const onlineOrderKey = (token: string) => ["public", "online-order", token] as const;
type OnlineOrderKey = ReturnType<typeof onlineOrderKey>;

const linkPath = (slug: string) => `/api/public/r/${encodeURIComponent(slug)}`;

// This read needs the anonymous browser cookie; ordinary public menu/status reads still omit cookies.
export const onlineContextQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public", "online-context", slug] as const,
    queryFn: ({ signal }) =>
      guestRequest<OnlineOrderingContext>(`${linkPath(slug)}/ordering-context`, {
        signal: withTimeout(signal),
      }),
    retry: false,
    staleTime: 0,
  });

export const readOnlineMenu = (slug: string, signal?: AbortSignal) =>
  publicRequest<OnlineMenu>(`${linkPath(slug)}/bootstrap`, { signal });

// The status and sold-out dishes change while the page is open, so it rereads like the QR menu.
export const onlineMenuQuery = (slug: string) =>
  queryOptions({
    queryKey: onlineMenuKey(slug),
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<OnlineMenu | null> => {
      try {
        return await readOnlineMenu(slug, signal);
      } catch (error) {
        // A confirmed unknown link replaces cached data; network failures keep it with a warning.
        if (error instanceof ApiError && error.code === "ONLINE_LINK_NOT_FOUND") return null;
        throw error;
      }
    },
  });

// 404 COUPON_INVALID for a code that doesn't exist or no longer works; limited per connection.
export const readCoupon = (slug: string, code: string, signal: AbortSignal) =>
  publicRequest<CouponPreview>(`${linkPath(slug)}/coupons/${encodeURIComponent(code)}`, {
    signal,
  });

export const submitOnlineRequest = (
  slug: string,
  intent: OnlineIntent,
  signal: AbortSignal,
  turnstileToken: string | null = null,
) =>
  publicWrite<OnlineSubmission>(
    `${linkPath(slug)}/requests`,
    { ...intent, turnstileToken },
    signal,
  );

// Recovery after an unknown result: GET only, by the request ID this tab saved before sending.
export const readSubmission = (slug: string, clientRequestId: string, signal: AbortSignal) =>
  publicRequest<OnlineSubmission>(
    `${linkPath(slug)}/requests/by-client-id/${encodeURIComponent(clientRequestId)}`,
    { signal },
  );

export const readOnlineOrder = (token: string, signal?: AbortSignal) =>
  publicRequest<OnlineOrder>(`/api/public/online-orders/${encodeURIComponent(token)}`, { signal });

// Every 10 seconds while the page is visible and online (React Query pauses in the background and
// offline), until the order has ended. Null means the link is unknown or no longer valid.
export const onlineOrderQuery = (token: string) =>
  queryOptions({
    queryKey: onlineOrderKey(token),
    refetchInterval: (
      query: Query<OnlineOrder | null, Error, OnlineOrder | null, OnlineOrderKey>,
    ) => {
      const data = query.state.data;
      return data === null || (data && orderEnded(data)) ? false : 10_000;
    },
    queryFn: async ({ signal }): Promise<OnlineOrder | null> => {
      try {
        return await readOnlineOrder(token, signal);
      } catch (error) {
        if (error instanceof ApiError && error.code === "ONLINE_ORDER_NOT_FOUND") return null;
        throw error;
      }
    },
  });
