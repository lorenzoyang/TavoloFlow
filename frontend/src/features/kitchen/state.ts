export type OrderStatus = "NEW" | "READY" | "CANCELLED";
export type PendingKitchenAction = { orderId: string; sessionId: string; kind: "ready" | "cancel"; expectedStatus: "NEW" | "READY" };
export type ArrivalBaseline = { count: number; at: number } | null;
export const pendingKitchenKey = (restaurantId: string, userId: string) => `tavoloflow:kitchen:${restaurantId}:${userId}`;

export function readPending(raw: string | null): PendingKitchenAction[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const entries: PendingKitchenAction[] = [];
    for (const row of value) {
      if (!row || typeof row.orderId !== "string" || !uuid.test(row.orderId) ||
          typeof row.sessionId !== "string" || !uuid.test(row.sessionId) ||
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

export function syncIsFresh(at: number, now: number, resumeAfter: number, active: boolean, failed: boolean) {
  return active && !failed && at > 0 && at >= resumeAfter && now - at < 30_000;
}

export function canCancel(role: "OWNER" | "STAFF", status: OrderStatus) {
  return status === "NEW" || (role === "OWNER" && status === "READY");
}

export function recoveryOutcome(action: PendingKitchenAction, status: OrderStatus) {
  if (status === (action.kind === "ready" ? "READY" : "CANCELLED")) return "reached";
  if (status !== action.expectedStatus) return "changed";
  return "confirm-again";
}
