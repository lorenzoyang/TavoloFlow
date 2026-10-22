import { ApiError, guestRequest } from "@/lib/api";
import { accessOutcome } from "./state";

export type GuestAccess = { restaurantId: string; tableId: string; sessionId: string; status: "ACTIVE";
  serviceStatus: "ACTIVE" | "SUSPENDED"; isTableEnabled: boolean; orderingEnabled: boolean };
export type AccessResult = { kind: "verified"; access: GuestAccess } | { kind: "unverified" | "ended" };
export const guestKey = (restaurantId: string, tableId: string, sessionId: string | null) =>
  ["guest", restaurantId, tableId, sessionId, "access"] as const;

export async function readAccess(sessionId: string, signal?: AbortSignal): Promise<AccessResult> {
  try { return { kind: "verified", access: await guestRequest<GuestAccess>(`/api/public/sessions/${sessionId}/access`, { signal }) }; }
  catch (error) {
    const outcome = error instanceof ApiError ? accessOutcome(error.code) : null;
    if (outcome) return { kind: outcome };
    throw error;
  }
}
