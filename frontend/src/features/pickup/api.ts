import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
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
