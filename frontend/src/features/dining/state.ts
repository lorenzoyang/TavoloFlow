export type PendingDiningAction = {
  kind: "open" | "close";
  tableId: string;
  sessionId?: string;
};

export function pendingDiningKey(restaurantId: string, userId: string) {
  return `tavoloflow:pending-dining:${restaurantId}:${userId}`;
}

export function parsePendingAction(raw: string | null): PendingDiningAction | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (typeof value?.tableId !== "string" || !value.tableId) return null;
    if (value.kind === "open") return { kind: "open", tableId: value.tableId };
    if (value.kind === "close" && typeof value.sessionId === "string" && value.sessionId)
      return { kind: "close", tableId: value.tableId, sessionId: value.sessionId };
  } catch { /* Unavailable or malformed storage cannot create a write intent. */ }
  return null;
}

export function recoveredOpen(activeSessionId: string | null | undefined) {
  return activeSessionId ? { kind: "active" as const, sessionId: activeSessionId }
    : { kind: "confirm-again" as const };
}
