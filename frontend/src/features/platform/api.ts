import { platformRequest, platformWrite, request, write } from "@/lib/api";
import type { PlatformIdentity } from "./identity";
import type { ManagedAccount, Restaurant, RestaurantDetail, TemporaryCredential } from "./state";

// Platform administration uses the platform identity; the owner's staff maintenance uses the store identity.
export const RESTAURANTS_PAGE_SIZE = 20;
export type RestaurantFilter = { search: string; status: string; page: number };
export type CreateRestaurantInput = {
  id: string;
  name: string;
  defaultLanguage: string;
  ownerUsername: string;
  staffUsername: string;
};

export const platformLogin = (username: string, password: string, signal: AbortSignal) =>
  platformWrite<PlatformIdentity>(
    "/api/platform/auth/login",
    "POST",
    { username, password },
    signal,
  );
export const changePlatformPassword = (
  currentPassword: string,
  newPassword: string,
  signal: AbortSignal,
) =>
  platformWrite<PlatformIdentity>(
    "/api/platform/auth/change-password",
    "POST",
    { currentPassword, newPassword },
    signal,
  );
export const platformLogout = () => platformWrite<void>("/api/platform/auth/logout", "POST", {});

export function listRestaurants(filter: RestaurantFilter, signal: AbortSignal) {
  const search = new URLSearchParams({
    page: String(filter.page),
    pageSize: String(RESTAURANTS_PAGE_SIZE),
  });
  if (filter.search) search.set("search", filter.search);
  if (filter.status) search.set("status", filter.status);
  return platformRequest<{ items: Restaurant[]; totalCount: number }>(
    `/api/platform/restaurants?${search}`,
    { signal },
  );
}
export const readRestaurant = (id: string, signal: AbortSignal) =>
  platformRequest<RestaurantDetail>(`/api/platform/restaurants/${id}`, { signal });

// The client chooses the restaurant ID, so a create whose result was lost can be retried with the same ID.
export const createRestaurant = (input: CreateRestaurantInput, signal: AbortSignal) =>
  platformWrite<{ restaurant: Restaurant; credentials: TemporaryCredential[] }>(
    "/api/platform/restaurants",
    "POST",
    input,
    signal,
  );
export const setServiceStatus = (id: string, status: "ACTIVE" | "SUSPENDED", signal: AbortSignal) =>
  platformWrite<Restaurant>(
    `/api/platform/restaurants/${id}/service-status`,
    "PATCH",
    { status },
    signal,
  );

// Account writes carry the credential version the administrator saw; a mismatch returns ACCOUNT_CHANGED.
export const setAccountActive = (
  id: string,
  account: ManagedAccount,
  isActive: boolean,
  signal: AbortSignal,
) =>
  platformWrite<ManagedAccount>(
    `/api/platform/restaurants/${id}/users/${account.id}/active`,
    "PATCH",
    { expectedCredentialVersion: account.credentialVersion, isActive },
    signal,
  );
export const resetAccountPassword = (id: string, account: ManagedAccount, signal: AbortSignal) =>
  platformWrite<TemporaryCredential>(
    `/api/platform/restaurants/${id}/users/${account.id}/reset-password`,
    "POST",
    { expectedCredentialVersion: account.credentialVersion },
    signal,
  );

export const readStaffAccount = (signal: AbortSignal) =>
  request<ManagedAccount>("/api/owner/staff", { signal });
export const resetStaffPassword = (expectedCredentialVersion: number, signal: AbortSignal) =>
  write<TemporaryCredential>(
    "/api/owner/staff/reset-password",
    "POST",
    { expectedCredentialVersion },
    signal,
  );
