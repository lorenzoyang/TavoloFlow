import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarClock,
  ChefHat,
  HandPlatter,
  History,
  House,
  LayoutGrid,
  QrCode,
  Receipt,
  ShoppingBag,
  UserCog,
} from "lucide-react";
import type { StaffLanguage } from "@/lib/staff-language";
import type { CurrentAccount } from "./api";
import { accountMessages } from "./messages";

// Pages follow the role and the restaurant's services: without dine-in there is no floor and no tables.
type NavAccount = Pick<CurrentAccount, "role" | "services">;
export type StaffDestination = {
  to:
    | "/staff"
    | "/staff/floor"
    | "/staff/kitchen"
    | "/staff/pass"
    | "/staff/orders"
    | "/staff/menu"
    | "/staff/tables"
    | "/staff/pickup"
    | "/staff/history"
    | "/staff/settings"
    | "/staff/subscription";
  label: string;
  description: string;
  icon: LucideIcon;
};

// The daily workspaces: the phone tab bar and the tablet/desktop rail show exactly these, in this order.
// Everything else is reached from the home page, so a device never needs more than five tabs.
export function staffNavItems(
  { role, services }: NavAccount,
  language: StaffLanguage,
): StaffDestination[] {
  const nav = accountMessages[language].nav;
  return [
    { to: "/staff", ...nav.home, icon: House },
    ...(services.dineIn ? [{ to: "/staff/floor" as const, ...nav.floor, icon: LayoutGrid }] : []),
    { to: "/staff/kitchen", ...nav.kitchen, icon: ChefHat },
    // STAFF have no bills, so the pass screen they carry dishes from takes that slot.
    role === "OWNER"
      ? { to: "/staff/orders", ...nav.orders, icon: Receipt }
      : { to: "/staff/pass", ...nav.pass, icon: HandPlatter },
    {
      to: "/staff/menu",
      label: nav.menu.label,
      description: role === "OWNER" ? nav.menu.ownerDescription : nav.menu.staffDescription,
      icon: BookOpen,
    },
  ];
}

// Less frequent pages, listed on the home page only.
export function staffManagementItems(
  { role, services }: NavAccount,
  language: StaffLanguage,
): StaffDestination[] {
  const nav = accountMessages[language].nav;
  const tables: StaffDestination[] = services.dineIn
    ? [
        {
          to: "/staff/tables",
          label: nav.tables.label,
          description: role === "OWNER" ? nav.tables.ownerDescription : nav.tables.staffDescription,
          icon: QrCode,
        },
      ]
    : [];
  const pickup: StaffDestination[] = services.pickup
    ? [{ to: "/staff/pickup", ...nav.pickup, icon: ShoppingBag }]
    : [];
  if (role !== "OWNER") return [...pickup, ...tables];
  return [
    ...pickup,
    ...tables,
    // STAFF have it as a tab; OWNER's slot holds the bills.
    { to: "/staff/pass", ...nav.pass, icon: HandPlatter },
    { to: "/staff/history", ...nav.history, icon: History },
    { to: "/staff/settings", ...nav.settings, icon: UserCog },
    { to: "/staff/subscription", ...nav.subscription, icon: CalendarClock },
  ];
}
