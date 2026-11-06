import type { Language } from "@/lib/language";
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
// The fourth tab is each role's own service job: OWNER settles bills, STAFF carry ready dishes.
// Every other tab keeps its place, so a shared tablet that switches accounts looks the same.
export function staffNavItems(role: Role, language: Language): StaffDestination[] {
  const nav = accountMessages[language].nav;
  const job: StaffDestination =
    role === "OWNER"
      ? { to: "/staff/orders", ...nav.orders, icon: Receipt }
      : { to: "/staff/pass", ...nav.pass, icon: HandPlatter };
  return [
    { to: "/staff", ...nav.home, icon: House },
    { to: "/staff/floor", ...nav.floor, icon: LayoutGrid },
    { to: "/staff/kitchen", ...nav.kitchen, icon: ChefHat },
    job,
    {
      to: "/staff/menu",
      label: nav.menu.label,
      description: role === "OWNER" ? nav.menu.ownerDescription : nav.menu.staffDescription,
      icon: BookOpen,
    },
  ];
}

// Less frequent pages, listed on the home page only.
export function staffManagementItems(role: Role, language: Language): StaffDestination[] {
  const nav = accountMessages[language].nav;
  const tables: StaffDestination = {
    to: "/staff/tables",
    label: nav.tables.label,
    description: role === "OWNER" ? nav.tables.ownerDescription : nav.tables.staffDescription,
    icon: QrCode,
  };
  if (role !== "OWNER") return [tables];
  return [
    tables,
    // STAFF have Pass as a tab; OWNER's fourth tab is Bill, so Pass stays here for them.
    { to: "/staff/pass", ...nav.pass, icon: HandPlatter },
    { to: "/staff/history", ...nav.history, icon: History },
    { to: "/staff/settings", ...nav.settings, icon: UserCog },
    { to: "/staff/subscription", ...nav.subscription, icon: CalendarClock },
  ];
}
