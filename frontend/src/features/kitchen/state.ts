import { isUuid } from "../../lib/ids.ts";

import type { MenuItem } from "../menu/api.ts";
import type { OrderItemStatus, OrderLine } from "../orders/api.ts";
import type { KitchenOrder } from "./api.ts";

export type OrderStatus = "NEW" | "PROCESSED";
// DISHES and NEW are two views of the same NEW orders.
export type KitchenView = "DISHES" | OrderStatus;
export type DishGroup = {
  key: string;
  lines: { order: KitchenOrder; line: OrderLine }[];
  quantity: number;
};
export type PendingKitchenAction = {
  orderId: string;
  sessionId: string;
  // null means a legacy whole-order operation: GET review only, never a new write.
  itemId: string | null;
  kind: "ready" | "cancel";
};
export type ArrivalBaseline = { count: number; at: number } | null;
// The NEW lines this screen showed at the last poll, under the hidden categories it was judged with.
export type LineBaseline = { ids: string[]; hidden: string; at: number } | null;
export type LineFilter = (line: Pick<OrderLine, "menuItemId">) => boolean;
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

// A screen that shows only some categories chimes for its own new dishes. added is null without a
// continuous baseline (first poll, a gap, or other hidden categories, whose revealed dishes are not new);
// the caller then falls back to the restaurant-wide order count, so no arrival goes unannounced.
export function screenArrivals(previous: LineBaseline, ids: string[], hidden: string, at: number) {
  const continuous =
    previous && previous.hidden === hidden && at > previous.at && at - previous.at < 30_000;
  const seen = new Set(previous?.ids);
  return {
    baseline: { ids, hidden, at },
    added: continuous ? ids.filter((id) => !seen.has(id)).length : null,
  };
}

// The categories a kitchen screen leaves out are a device preference, like its sound. Only the hidden
// ones are stored, so a category added later shows on every screen until someone hides it.
export const hiddenCategoriesKey = (restaurantId: string) =>
  `tavoloflow:kitchen-hidden-categories:${restaurantId}`;

export function readHiddenCategories(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter(isUuid))] : [];
  } catch {
    return [];
  }
}

// null while nothing can be hidden. A dish that is no longer on the menu, or whose menu is not loaded,
// always shows: a dish on two screens is better than a dish on none.
export function categoryFilter(
  items: Pick<MenuItem, "id" | "categoryId">[] | undefined,
  hidden: readonly string[],
): LineFilter | null {
  if (!items || hidden.length === 0) return null;
  const left = new Set(items.filter((i) => hidden.includes(i.categoryId)).map((i) => i.id));
  if (left.size === 0) return null;
  return (line) => line.menuItemId === null || !left.has(line.menuItemId);
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
export function dishGroups(orders: KitchenOrder[], shows: LineFilter = () => true): DishGroup[] {
  const groups = new Map<string, DishGroup>();
  const oldestFirst = [...orders].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const order of oldestFirst)
    for (const line of order.items) {
      if (line.status !== "NEW" || !shows(line)) continue;
      const key =
        line.menuItemId ?? JSON.stringify([line.itemCode, line.nameZh, line.nameIt, line.nameEn]);
      let group = groups.get(key);
      if (!group) {
        group = { key, lines: [], quantity: 0 };
        groups.set(key, group);
      }
      group.lines.push({ order, line });
      group.quantity += line.quantity;
    }
  return [...groups.values()];
}
