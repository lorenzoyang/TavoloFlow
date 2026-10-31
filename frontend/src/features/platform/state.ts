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
  dineInEnabled: boolean;
  pickupEnabled: boolean;
  // Public phone and online menu link name; both are required while pickup is on.
  phone: string | null;
  slug: string | null;
  pickupPaused: boolean;
  subscription?: SubscriptionSummary | null;
};
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
    | "phone"
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
      "phone",
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
    throw new Error("无法核对目标账号，请重新读取。");
  return account.credentialVersion > p.expectedVersion;
}
