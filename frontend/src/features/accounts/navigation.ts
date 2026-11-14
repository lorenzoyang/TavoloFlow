import type { Language } from "@/lib/language";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarClock,
  ChefHat,
  Globe,
  HandPlatter,
  History,
  House,
  LayoutGrid,
  QrCode,
  Receipt,
  UserCog,
} from "lucide-react";
import { staffManagementRoutes, staffNavRoutes, type NavAccount, type StaffRoute } from "./state";
import { accountMessages } from "./messages";

export type StaffDestination = {
  to: StaffRoute;
  label: string;
  description: string;
  icon: LucideIcon;
};

function destination(to: StaffRoute, account: NavAccount, language: Language): StaffDestination {
  const nav = accountMessages[language].nav;
  const owner = account.role === "OWNER";
  switch (to) {
    case "/staff":
      return { to, ...nav.home, icon: House };
    case "/staff/floor":
      return { to, ...nav.floor, icon: LayoutGrid };
    case "/staff/kitchen":
      return { to, ...nav.kitchen, icon: ChefHat };
    case "/staff/orders":
      return { to, ...nav.orders, icon: Receipt };
    case "/staff/pass":
      return { to, ...nav.pass, icon: HandPlatter };
    case "/staff/menu":
      return {
        to,
        label: nav.menu.label,
        description: owner ? nav.menu.ownerDescription : nav.menu.staffDescription,
        icon: BookOpen,
      };
    case "/staff/tables":
      return {
        to,
        label: nav.tables.label,
        description: owner ? nav.tables.ownerDescription : nav.tables.staffDescription,
        icon: QrCode,
      };
    case "/staff/online-settings":
      return { to, ...nav.online, icon: Globe };
    case "/staff/history":
      return { to, ...nav.history, icon: History };
    case "/staff/settings":
      return { to, ...nav.settings, icon: UserCog };
    case "/staff/subscription":
      return { to, ...nav.subscription, icon: CalendarClock };
  }
}

// The tabs and home entries; state.ts decides which pages the role and services allow.
export const staffNavItems = (account: NavAccount, language: Language) =>
  staffNavRoutes(account).map((to) => destination(to, account, language));

export const staffManagementItems = (account: NavAccount, language: Language) =>
  staffManagementRoutes(account).map((to) => destination(to, account, language));
