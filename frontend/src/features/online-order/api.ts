import { queryOptions } from "@tanstack/react-query";
import { ApiError, guestWrite, publicRequest } from "@/lib/api";
import type { Category, MenuItem } from "@/features/menu/api";
import type { Language } from "@/lib/language";
import type { RestaurantTheme } from "@/lib/theme";
import type { PickupIntent, PickupOrderStatus, RejectReason } from "./state";
import { confirmedPickupSubmission } from "./state";

export type PickupAvailability = "OPEN" | "PAUSED" | "CLOSED_HOURS" | "NOT_OFFERED" | "SUSPENDED";
export type OnlineMenu = {
  restaurant: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: Language;
    theme: RestaurantTheme;
    phone: string | null;
  };
  // nextOpensAt is set while CLOSED_HOURS when an opening falls within seven days.
  pickup: { status: PickupAvailability; nextOpensAt: string | null };
  menu: { availableLanguages: Language[]; categories: Category[]; items: MenuItem[] };
};
export type PickupSubmission = { statusToken: string; pickupNumber: number; expiresAt: string };
export type PickupOrder = {
  restaurant: {
    id: string;
    name: string;
    defaultLanguage: Language;
    theme: RestaurantTheme;
    phone: string | null;
    slug: string | null;
  };
  pickupNumber: number;
  customerName: string;
  submittedAt: string;
  expiresAt: string;
  estimatedReadyAt: string | null;
  status: PickupOrderStatus;
  rejectReason: RejectReason | null;
  items: {
    itemCode: string | null;
    nameZh: string | null;
    nameIt: string | null;
    nameEn: string | null;
    unitPriceCents: number;
    quantity: number;
    remark: string | null;
    cancelled: boolean;
  }[];
  payableAmountCents: number;
};

// Public keys survive staff and guest identity changes, like the QR menu.
export const onlineMenuKey = (slug: string) => ["public", "pickup", slug] as const;
export const pickupOrderKey = (token: string) => ["public", "pickup-order", token] as const;

// Anonymous reads send no credentials.
export const readOnlineMenu = (slug: string, signal?: AbortSignal) =>
  publicRequest<OnlineMenu>(`/api/public/r/${encodeURIComponent(slug)}/bootstrap`, { signal });

export const onlineMenuQuery = (slug: string) =>
  queryOptions({
    queryKey: onlineMenuKey(slug),
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<OnlineMenu | null> => {
      try {
        return await readOnlineMenu(slug, signal);
      } catch (error) {
        // A confirmed invalid link replaces cached data; network failures keep it with a warning.
        if (error instanceof ApiError && error.code === "MENU_LINK_NOT_FOUND") return null;
        throw error;
      }
    },
  });

// The submission is anonymous but carries the /api/public CSRF token, fetched fresh for every attempt.
export const submitPickupRequest = (slug: string, intent: PickupIntent, signal: AbortSignal) =>
  guestWrite<PickupSubmission>(
    `/api/public/r/${encodeURIComponent(slug)}/pickup-requests`,
    intent,
    signal,
  ).then(confirmedPickupSubmission);
// Recovery after an unknown result: 404 only means "not found yet".
export const readPickupByClientId = (slug: string, clientRequestId: string, signal: AbortSignal) =>
  publicRequest<PickupSubmission>(
    `/api/public/r/${encodeURIComponent(slug)}/pickup-requests/by-client-id/${clientRequestId}`,
    { signal },
  ).then(confirmedPickupSubmission);

export const readPickupOrder = (token: string, signal?: AbortSignal) =>
  publicRequest<PickupOrder>(`/api/public/pickup-requests/${encodeURIComponent(token)}`, {
    signal,
  });
export const pickupOrderQuery = (token: string) =>
  queryOptions({
    queryKey: pickupOrderKey(token),
    queryFn: async ({ signal }): Promise<PickupOrder | null> => {
      try {
        return await readPickupOrder(token, signal);
      } catch (error) {
        // Unknown, or finished more than a day ago.
        if (error instanceof ApiError && error.code === "PICKUP_NOT_FOUND") return null;
        throw error;
      }
    },
  });
