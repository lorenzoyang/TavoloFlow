// The floor's two writes whose result can be lost. Closing a visit is recovered by billing/useClosure.
export type PendingDiningAction =
  { kind: "open"; tableId: string } | { kind: "accepting"; enabled: boolean };

export function pendingDiningKey(restaurantId: string, userId: string) {
  return `tavoloflow:pending-dining:${restaurantId}:${userId}`;
}

export function parsePendingAction(raw: string | null): PendingDiningAction | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.kind === "accepting" && typeof value.enabled === "boolean")
      return { kind: "accepting", enabled: value.enabled };
    if (value?.kind === "open" && typeof value.tableId === "string" && value.tableId)
      return { kind: "open", tableId: value.tableId };
  } catch {
    /* Unavailable or malformed storage cannot create a write intent. */
  }
  return null;
}

export function recoveredOpen(activeSessionId: string | null | undefined) {
  return activeSessionId
    ? { kind: "active" as const, sessionId: activeSessionId }
    : { kind: "confirm-again" as const };
}
