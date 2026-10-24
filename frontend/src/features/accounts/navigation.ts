import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarClock,
  ChefHat,
  History,
  House,
  LayoutGrid,
  QrCode,
  Receipt,
  UserCog,
} from "lucide-react";
import type { CurrentAccount } from "./api";

type Role = CurrentAccount["role"];
export type StaffDestination = {
  to:
    | "/staff"
    | "/staff/floor"
    | "/staff/kitchen"
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
export function staffNavItems(role: Role): StaffDestination[] {
  return [
    { to: "/staff", label: "首页", description: "常用入口与账号", icon: House },
    {
      to: "/staff/floor",
      label: "桌台",
      description: "开桌、告知入桌码、查看本桌账单",
      icon: LayoutGrid,
    },
    {
      to: "/staff/kitchen",
      label: "厨房",
      description: "按下单顺序出餐，完成或取消整单",
      icon: ChefHat,
    },
    ...(role === "OWNER"
      ? [
          {
            to: "/staff/orders" as const,
            label: "结账",
            description: "核对整桌账单，线下收款后清桌",
            icon: Receipt,
          },
        ]
      : []),
    {
      to: "/staff/menu",
      label: "菜单",
      description: role === "OWNER" ? "维护分类、菜品与售罄状态" : "把暂时没有的菜设为售罄",
      icon: BookOpen,
    },
  ];
}

// Less frequent pages, listed on the home page only.
export function staffManagementItems(role: Role): StaffDestination[] {
  const tables: StaffDestination = {
    to: "/staff/tables",
    label: "桌位与二维码",
    description: role === "OWNER" ? "添加桌位，下载二维码和桌卡" : "查看桌位与用餐状态",
    icon: QrCode,
  };
  if (role !== "OWNER") return [tables];
  return [
    tables,
    {
      to: "/staff/history",
      label: "历史账单",
      description: "按日期查看已关闭的账单",
      icon: History,
    },
    { to: "/staff/settings", label: "员工账号", description: "重置员工的登录密码", icon: UserCog },
    {
      to: "/staff/subscription",
      label: "年费与收费周期",
      description: "查看服务期限和付款记录",
      icon: CalendarClock,
    },
  ];
}
