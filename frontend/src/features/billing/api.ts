import type { CurrentAccount } from "@/features/accounts/api";
import type { KitchenOrder } from "@/features/kitchen/api";
import { request } from "@/lib/api";
import type { BillSummary, HistoryFilters } from "./state";

export type BillPage = { summary: BillSummary; orders: KitchenOrder[]; nextCursor: string | null; receivedAt: number };
export type HistoryPage = { items: BillSummary[]; nextCursor: string | null; totalCount: number;
  fromDate: string; toDate: string; timeZone: string };
export const billingKey = (account: CurrentAccount) => ["billing", account.restaurantId, account.userId] as const;
export const historyKey = (account: CurrentAccount) => ["history", account.restaurantId, account.userId] as const;
export async function readBill(id: string, history: boolean, cursor: string | null, signal: AbortSignal): Promise<BillPage> {
  const path = history ? `/api/owner/history/${id}` : `/api/staff/sessions/${id}/bill`;
  const data = await request<Omit<BillPage, "receivedAt">>(path + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), { signal });
  return { ...data, receivedAt: Date.now() };
}
export function readHistory(filters: HistoryFilters, cursor: string | null, signal: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return request<HistoryPage>(`/api/owner/history?${params}`, { signal });
}
