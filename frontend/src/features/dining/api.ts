import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import type { BillSummary } from "@/features/billing/state";
import { request, write } from "@/lib/api";
import { storeKey } from "@/lib/store-views";

export type FloorTable = {
  id: string;
  tableLabel: string;
  isEnabled: boolean;
  session: {
    id: string;
    openedAt: string;
    orderCount: number;
    newItemCount: number;
    totalAmountCents: number;
  } | null;
};
type Floor = {
  serviceStatus: "ACTIVE" | "SUSPENDED";
  orderingEnabled: boolean;
  joinCodeRequired: boolean;
  tables: FloorTable[];
};
export type CodeResult = { sessionId: string; joinCode: string };
// joinCode is null when guests of this restaurant join without one.
type OpenResult = { session: BillSummary; joinCode: string | null };

export const floorKey = (account: AccountScope) => storeKey("floor", account);
export const diningKey = (account: AccountScope) => storeKey("dining", account);
export const sessionKey = (account: AccountScope, id: string) =>
  [...diningKey(account), id] as const;

export const readFloor = (signal?: AbortSignal) => request<Floor>("/api/staff/floor", { signal });
const readSession = (id: string, signal?: AbortSignal) =>
  request<BillSummary>(`/api/staff/sessions/${id}`, { signal });
export const floorQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: floorKey(account),
    queryFn: ({ signal }) => readFloor(signal),
    refetchInterval: 30_000,
  });
export const sessionQuery = (account: AccountScope, id: string) =>
  queryOptions({
    queryKey: sessionKey(account, id),
    queryFn: ({ signal }) => readSession(id, signal),
    enabled: !!id,
    refetchInterval: 30_000,
  });

// Opening is not idempotent: after an unknown result the floor reads the table again and asks the staff.
export const openTable = (tableId: string, signal: AbortSignal) =>
  write<OpenResult>(`/api/staff/tables/${tableId}/open`, "POST", {}, signal);
export const setAcceptingOrders = (enabled: boolean, signal: AbortSignal) =>
  write<{ orderingEnabled: boolean }>("/api/staff/accepting-orders", "PATCH", { enabled }, signal);
export const readStaffJoinCode = (sessionId: string, signal: AbortSignal) =>
  request<CodeResult>(`/api/staff/sessions/${sessionId}/join-code`, { signal });
