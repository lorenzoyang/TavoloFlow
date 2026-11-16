import { isUuid } from "../../lib/ids.ts";
import type { Language } from "../../lib/language.ts";
import type { RestaurantTheme } from "../../lib/theme.ts";
import type { SubscriptionSummary } from "../subscriptions/state.ts";

export type ManagedAccount = {
  id: string;
  username: string;
  role: "OWNER" | "STAFF";
  isActive: boolean;
  mustChangePassword: boolean;
  credentialVersion: number;
};
export type Restaurant = {
  id: string;
  name: string;
  defaultLanguage: Language;
  timeZone: string;
  currencyCode: string;
  serviceStatus: "ACTIVE" | "SUSPENDED";
  orderingEnabled: boolean;
  createdAt: string;
  googleMapsUrl: string | null;
  joinCodeRequired: boolean;
  theme: RestaurantTheme;
  services: RestaurantServices;
  slug: string | null;
  subscription?: SubscriptionSummary | null;
};
export type RestaurantServices = { dineIn: boolean; online: boolean };
export type RestaurantDetail = { restaurant: Restaurant; accounts: ManagedAccount[] };
export type TemporaryCredential = { account: ManagedAccount; temporaryPassword: string };
export type PendingManagement = {
  kind:
    | "create"
    | "status"
    | "maps"
    | "joinCode"
    | "theme"
    | "services"
    | "slug"
    | "delete"
    | "active"
    | "reset";
  restaurantId: string;
  userId?: string;
  expectedVersion?: number;
};

export function managementKey(scope: "platform" | "store", identity: string) {
  return `tavoloflow:management:${scope}:${identity}`;
}
export function readPending(raw: string | null): PendingManagement | null {
  if (!raw) return null;
  const p = JSON.parse(raw) as Partial<PendingManagement>;
  if (
    ![
      "create",
      "status",
      "maps",
      "joinCode",
      "theme",
      "services",
      "slug",
      "delete",
      "active",
      "reset",
    ].includes(p.kind ?? "") ||
    !isUuid(p.restaurantId) ||
    (p.userId !== undefined && !isUuid(p.userId)) ||
    ((p.kind === "active" || p.kind === "reset") &&
      (!p.userId || !Number.isSafeInteger(p.expectedVersion) || p.expectedVersion! < 1))
  )
    throw new Error("Invalid pending management action");
  // Explicit fields only: passwords and untrusted extra properties never survive parsing.
  return {
    kind: p.kind!,
    restaurantId: p.restaurantId!,
    userId: p.userId,
    expectedVersion: p.expectedVersion,
  };
}
export function recoveryUrl(scope: "platform" | "store", p: PendingManagement) {
  return scope === "platform" ? `/api/platform/restaurants/${p.restaurantId}` : "/api/owner/staff";
}
// Whether the target's credentials moved past the confirmed version: by this request or another
// administrator's, which a read cannot tell apart. Unchanged means the request may still arrive.
export function credentialsChanged(p: PendingManagement, account: ManagedAccount | undefined) {
  if (!account || account.id !== p.userId || p.expectedVersion === undefined)
    throw new Error("The target account cannot be checked");
  return account.credentialVersion > p.expectedVersion;
}

// The online ordering link /r/{slug}, the same rule as the server's InputRules.IsSlug.
export const isSlug = (value: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value);

// At least one service stays on, and online ordering needs its link.
export const servicesValid = (services: RestaurantServices, slug: string | null) =>
  (services.dineIn || services.online) && (!services.online || !!slug);

// The restaurant list's filters live in the URL, so returning from a restaurant keeps them. Unknown
// values fall back to "all", and the first page is the default, so neither appears in the URL.
export const RESTAURANT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export const SUBSCRIPTION_FILTERS = ["UNPAID", "DUE_SOON", "EXPIRED", "UNCONFIGURED"] as const;
export const RESTAURANT_SORTS = ["EXPIRY"] as const;
export type RestaurantsSearch = {
  search?: string;
  status?: (typeof RESTAURANT_STATUSES)[number];
  subscriptionStatus?: (typeof SUBSCRIPTION_FILTERS)[number];
  sort?: (typeof RESTAURANT_SORTS)[number];
  page?: number;
};
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((item) => item === value);
}
export function restaurantsSearch(search: Record<string, unknown>): RestaurantsSearch {
  const page = Number(search.page);
  return {
    search:
      typeof search.search === "string"
        ? search.search.trim().slice(0, 150) || undefined
        : undefined,
    status: oneOf(search.status, RESTAURANT_STATUSES),
    subscriptionStatus: oneOf(search.subscriptionStatus, SUBSCRIPTION_FILTERS),
    sort: oneOf(search.sort, RESTAURANT_SORTS),
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  };
}
