import type { CurrentAccount } from "./api";

// Pure navigation rules, node-tested: which store pages each role sees for the services the platform
// turned on. navigation.ts adds the labels and icons.
export type StaffRoute =
  | "/staff"
  | "/staff/floor"
  | "/staff/kitchen"
  | "/staff/pass"
  | "/staff/orders"
  | "/staff/menu"
  | "/staff/tables"
  | "/staff/online"
  | "/staff/online-settings"
  | "/staff/history"
  | "/staff/settings"
  | "/staff/subscription";

export type NavAccount = Pick<CurrentAccount, "role" | "services">;

// The daily workspaces: the phone tab bar and the tablet/desktop rail show exactly these, in this order.
// The fourth workspace is each role's own service job: OWNER settles bills, STAFF carry ready dishes.
// Floor exists only with QR dine-in; the other tabs keep their order, so a shared tablet that switches
// accounts looks the same.
export function staffNavRoutes(account: NavAccount): StaffRoute[] {
  return [
    "/staff",
    ...(account.services.dineIn ? (["/staff/floor"] as const) : []),
    "/staff/kitchen",
    account.role === "OWNER" ? "/staff/orders" : "/staff/pass",
    "/staff/menu",
  ];
}

// Less frequent pages, listed on the home page only.
export function staffManagementRoutes(account: NavAccount): StaffRoute[] {
  const service: StaffRoute[] = [
    ...(account.services.dineIn ? (["/staff/tables"] as const) : []),
    ...(account.services.online ? (["/staff/online", "/staff/online-settings"] as const) : []),
  ];
  if (account.role !== "OWNER") return service;
  // STAFF have Pass as a tab; OWNER's fourth tab is Bill, so Pass stays here for them.
  return [...service, "/staff/pass", "/staff/history", "/staff/settings", "/staff/subscription"];
}
