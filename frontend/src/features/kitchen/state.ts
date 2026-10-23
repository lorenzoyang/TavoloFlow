import { isUuid } from "../../lib/ids.ts";

export type OrderStatus = "NEW" | "READY" | "CANCELLED";
export type PendingKitchenAction = { orderId: string; sessionId: string; kind: "ready" | "cancel"; expectedStatus: "NEW" | "READY" };
export type ArrivalBaseline = { count: number; at: number } | null;
export const pendingKitchenKey = (restaurantId: string, userId: string) => `tavoloflow:kitchen:${restaurantId}:${userId}`;

export function readPending(raw: string | null): PendingKitchenAction[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    const entries: PendingKitchenAction[] = [];
    for (const row of value) {
      if (!row || !isUuid(row.orderId) || !isUuid(row.sessionId) ||
          (row.kind !== "ready" && row.kind !== "cancel") ||
          (row.expectedStatus !== "NEW" && row.expectedStatus !== "READY") ||
          (row.kind === "ready" && row.expectedStatus !== "NEW")) continue;
      if (!entries.some(x => x.orderId === row.orderId)) entries.push({ orderId: row.orderId,
        sessionId: row.sessionId, kind: row.kind, expectedStatus: row.expectedStatus });
    }
    return entries;
  } catch { return []; }
}

export function arrivals(previous: ArrivalBaseline, count: number, at: number) {
  const continuous = previous && at > previous.at && at - previous.at < 30_000;
  return { baseline: { count, at }, added: continuous ? Math.max(0, count - previous.count) : 0 };
}

export function canCancel(role: "OWNER" | "STAFF", status: OrderStatus) {
  return status === "NEW" || (role === "OWNER" && status === "READY");
}

export function recoveryOutcome(action: PendingKitchenAction, status: OrderStatus) {
  if (status === (action.kind === "ready" ? "READY" : "CANCELLED")) return "reached";
  if (status !== action.expectedStatus) return "changed";
  return "confirm-again";
}
