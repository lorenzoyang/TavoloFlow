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
  UserCog,
} from "lucide-react";
import type { StaffLanguage } from "@/lib/staff-language";
import type { CurrentAccount } from "./api";
import { accountMessages } from "./messages";

type Role = CurrentAccount["role"];
export type StaffDestination = {
  to:
    | "/staff"
    | "/staff/floor"
    | "/staff/kitchen"
    | "/staff/pass"
    | "/staff/orders"
    | "/staff/menu"
    | "/staff/tables"
    | "/staff/history"
    | "/staff/settings"
    | "/staff/subscription";
  label: string;
  description: string;
  icon: LucideIcon;
};

// The daily workspaces: the phone tab bar and the tablet/desktop rail show exactly these, in this order.
// Everything else is reached from the home page, so a device never needs more than five tabs.
export function staffNavItems(role: Role, language: StaffLanguage): StaffDestination[] {
  const nav = accountMessages[language].nav;
  return [
    { to: "/staff", ...nav.home, icon: House },
    { to: "/staff/floor", ...nav.floor, icon: LayoutGrid },
    { to: "/staff/kitchen", ...nav.kitchen, icon: ChefHat },
    ...(role === "OWNER" ? [{ to: "/staff/orders" as const, ...nav.orders, icon: Receipt }] : []),
    {
      to: "/staff/menu",
      label: nav.menu.label,
      description: role === "OWNER" ? nav.menu.ownerDescription : nav.menu.staffDescription,
      icon: BookOpen,
    },
  ];
}

// Less frequent pages, listed on the home page only.
export function staffManagementItems(role: Role, language: StaffLanguage): StaffDestination[] {
  const nav = accountMessages[language].nav;
  const tables: StaffDestination = {
    to: "/staff/tables",
    label: nav.tables.label,
    description: role === "OWNER" ? nav.tables.ownerDescription : nav.tables.staffDescription,
    icon: QrCode,
  };
  // Lives on the counter tablet: waiters carrying dishes do not use their phones for it.
  const pass: StaffDestination = { to: "/staff/pass", ...nav.pass, icon: HandPlatter };
  if (role !== "OWNER") return [tables, pass];
  return [
    tables,
    pass,
    { to: "/staff/history", ...nav.history, icon: History },
    { to: "/staff/settings", ...nav.settings, icon: UserCog },
    { to: "/staff/subscription", ...nav.subscription, icon: CalendarClock },
  ];
}
