import { queryOptions } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { request } from "@/lib/api";

export type FloorTable = { id: string; tableLabel: string; isEnabled: boolean;
  session: { id: string; openedAt: string; orderCount: number; newOrderCount: number; totalAmountCents: number } | null };
export type Floor = { serviceStatus: "ACTIVE" | "SUSPENDED"; orderingEnabled: boolean; tables: FloorTable[] };
export type DiningSession = { id: string; tableId: string | null; tableLabel: string; status: "ACTIVE" | "CLOSED";
  openedAt: string; closedAt: string | null; closeReason: string | null; billVersion: number;
  orderCount: number; totalAmountCents: number };
export type CodeResult = { sessionId: string; joinCode: string };
export type OpenResult = { session: DiningSession; joinCode: string };

export const floorKey = (account: CurrentAccount) => ["floor", account.restaurantId, account.userId] as const;
export const sessionKey = (account: CurrentAccount, id: string) => ["dining", account.restaurantId, account.userId, id] as const;
export const floorQuery = (account: CurrentAccount) => queryOptions({
  queryKey: floorKey(account), queryFn: ({ signal }) => request<Floor>("/api/staff/floor", { signal }), refetchInterval: 30_000,
});
export const sessionQuery = (account: CurrentAccount, id: string) => queryOptions({
  queryKey: sessionKey(account, id), queryFn: ({ signal }) => request<DiningSession>(`/api/staff/sessions/${id}`, { signal }),
  enabled: !!id, refetchInterval: 30_000,
});
