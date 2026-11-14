import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import { storeKey } from "@/lib/store-views";
import type { OnlineHour } from "./state";

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
};

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
export const pauseOnline = (until: "SLOT" | "TODAY") =>
  write<OnlineSettings>("/api/staff/online/pause", "PUT", { until });
export const resumeOnline = () => write<OnlineSettings>("/api/staff/online/pause", "DELETE");
export const saveOnlineHours = (slots: OnlineHour[]) =>
  write<OnlineSettings>("/api/owner/online/hours", "PUT", { slots });
export const savePublicPhone = (publicPhone: string | null) =>
  write<OnlineSettings>("/api/owner/online/phone", "PATCH", { publicPhone });
