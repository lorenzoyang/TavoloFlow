export type GuestVisit = { sessionId: string | null; skipped: boolean; ended: boolean };
export const guestVisitKey = (token: string) => `tavoloflow:guest-visit:${token}`;

export function readVisit(raw: string | null): GuestVisit | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      (typeof value?.sessionId === "string" || value?.sessionId === null) &&
      typeof value?.skipped === "boolean" &&
      typeof value?.ended === "boolean"
    )
      return { sessionId: value.sessionId, skipped: value.skipped, ended: value.ended };
  } catch {
    /* Ignore invalid tab metadata; it is never authorization. */
  }
  return null;
}

export function reconcileVisit(visit: GuestVisit, activeId: string | null): GuestVisit {
  if (visit.ended) return visit;
  if (visit.sessionId && visit.sessionId !== activeId) return { ...visit, ended: true };
  if (!visit.sessionId && activeId) return { sessionId: activeId, skipped: false, ended: false };
  return visit;
}

export function accessOutcome(code: string): "unverified" | "ended" | null {
  if (["GUEST_AUTH_REQUIRED", "GUEST_SESSION_MISMATCH", "GUEST_ACCESS_DENIED"].includes(code))
    return "unverified";
  if (
    [
      "SESSION_CLOSED",
      "SESSION_NOT_FOUND",
      "QR_NOT_FOUND",
      "TABLE_NOT_FOUND",
      "RESTAURANT_NOT_FOUND",
    ].includes(code)
  )
    return "ended";
  return null;
}
