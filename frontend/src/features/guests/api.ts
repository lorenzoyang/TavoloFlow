import { ApiError, guestRequest, guestWrite } from "@/lib/api";
import { accessOutcome } from "./state";

export type GuestAccess = { restaurantId: string; tableId: string; sessionId: string; status: "ACTIVE";
  serviceStatus: "ACTIVE" | "SUSPENDED"; isTableEnabled: boolean; orderingEnabled: boolean };
export type AccessResult = { kind: "verified"; access: GuestAccess } | { kind: "unverified" | "ended" };

// Guest cache keys nest restaurant > table > visit (session) > resource, so one prefix clears a whole
// visit, a whole table or every guest entry. Code that filters by position relies on this layout.
export const guestKeys = {
  all: ["guest"] as const,
  table: (restaurantId: string, tableId: string) => ["guest", restaurantId, tableId] as const,
  visit: (restaurantId: string, tableId: string, sessionId: string | null) =>
    ["guest", restaurantId, tableId, sessionId] as const,
  access: (restaurantId: string, tableId: string, sessionId: string | null) =>
    ["guest", restaurantId, tableId, sessionId, "access"] as const,
};

export const readGuestAccess = (sessionId: string, signal?: AbortSignal) =>
  guestRequest<GuestAccess>(`/api/public/sessions/${sessionId}/access`, { signal });

export const joinVisit = (token: string, sessionId: string, joinCode: string, signal: AbortSignal) =>
  guestWrite<{ restaurantId: string; tableId: string; sessionId: string }>(
    `/api/public/qr/${encodeURIComponent(token)}/join`, { sessionId, joinCode }, signal);

export const readGuestJoinCode = (sessionId: string, signal: AbortSignal) =>
  guestRequest<{ sessionId: string; joinCode: string }>(`/api/public/sessions/${sessionId}/join-code`, { signal });

// Known authorization outcomes resolve to a state instead of throwing.
export async function readAccess(sessionId: string, signal?: AbortSignal): Promise<AccessResult> {
  try { return { kind: "verified", access: await readGuestAccess(sessionId, signal) }; }
  catch (error) {
    const outcome = error instanceof ApiError ? accessOutcome(error.code) : null;
    if (outcome) return { kind: outcome };
    throw error;
  }
}
