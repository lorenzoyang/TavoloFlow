import { isUuid } from "../../lib/ids.ts";

import type { OrderItemStatus, OrderLine } from "../orders/api.ts";
import type { KitchenOrder } from "./api.ts";

export type OrderStatus = "NEW" | "PROCESSED";
// DISHES and NEW are two views of the same NEW orders.
export type KitchenView = "DISHES" | OrderStatus;
export type DishGroup = {
  key: string;
  lines: { order: KitchenOrder; line: OrderLine }[];
  quantity: number;
  allergenCodes: string[];
};
export type PendingKitchenAction = {
  orderId: string;
  sessionId: string;
  // null means a legacy whole-order operation: GET review only, never a new write.
  itemId: string | null;
  kind: "ready" | "cancel";
};
export type ArrivalBaseline = { count: number; at: number } | null;
export const pendingKitchenKey = (restaurantId: string, userId: string) =>
  `tavoloflow:kitchen:${restaurantId}:${userId}`;

export function readPending(raw: string | null): PendingKitchenAction[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    const entries: PendingKitchenAction[] = [];
    for (const row of value) {
      if (
        !row ||
        !isUuid(row.orderId) ||
        !isUuid(row.sessionId) ||
        (row.kind !== "ready" && row.kind !== "cancel")
      )
        continue;
      const legacy =
        row.itemId === null ||
        (row.itemId === undefined &&
          (row.expectedStatus === "NEW" ||
            (row.kind === "cancel" && row.expectedStatus === "READY")));
      if (!legacy && !isUuid(row.itemId)) continue;
      if (!entries.some((x) => x.orderId === row.orderId))
        entries.push({
          orderId: row.orderId,
          sessionId: row.sessionId,
          itemId: legacy ? null : row.itemId,
          kind: row.kind,
        });
    }
    return entries;
  } catch {
    return [];
  }
}

export function arrivals(previous: ArrivalBaseline, count: number, at: number) {
  const continuous = previous && at > previous.at && at - previous.at < 30_000;
  return { baseline: { count, at }, added: continuous ? Math.max(0, count - previous.count) : 0 };
}

// How long a NEW order has waited, as a colour the cook can read across the kitchen. The thresholds
// are a display choice only; nothing is blocked or reordered by them.
export function waitLevel(minutes: number): "normal" | "late" | "overdue" {
  return minutes >= 20 ? "overdue" : minutes >= 10 ? "late" : "normal";
}

export function canCancel(status: OrderItemStatus) {
  return status === "NEW";
}

export function recoveryOutcome(action: PendingKitchenAction, status: OrderItemStatus | undefined) {
  if (action.itemId === null) return "legacy-reviewed";
  if (!status) return "missing";
  if (status === (action.kind === "ready" ? "READY" : "CANCELLED")) return "reached";
  if (status !== "NEW") return "changed";
  return "confirm-again";
}

// Gathers the NEW lines of every loaded order by dish, so a cook sees at once what can be made together.
// Remarks stay on their lines; a deleted dish is matched by its snapshot. Groups and their lines put the
// longest wait first.
export function dishGroups(orders: KitchenOrder[]): DishGroup[] {
  const groups = new Map<string, DishGroup>();
  const oldestFirst = [...orders].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const order of oldestFirst)
    for (const line of order.items) {
      if (line.status !== "NEW") continue;
      const key =
        line.menuItemId ?? JSON.stringify([line.itemCode, line.nameZh, line.nameIt, line.nameEn]);
      let group = groups.get(key);
      if (!group) {
        group = { key, lines: [], quantity: 0, allergenCodes: [] };
        groups.set(key, group);
      }
      group.lines.push({ order, line });
      group.quantity += line.quantity;
      for (const code of line.allergenCodes)
        if (!group.allergenCodes.includes(code)) group.allergenCodes.push(code);
    }
  return [...groups.values()];
}
