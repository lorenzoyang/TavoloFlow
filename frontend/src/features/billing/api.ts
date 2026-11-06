import type { AccountScope } from "@/features/accounts/api";
import type { KitchenOrder } from "@/features/kitchen/api";
import { request } from "@/lib/api";
import { storeKey } from "@/lib/store-views";
import type { BillSummary, HistoryFilters } from "./state";

type BillPage = {
  summary: BillSummary;
  orders: KitchenOrder[];
  nextCursor: string | null;
  receivedAt: number;
};
type HistoryPage = {
  items: BillSummary[];
  nextCursor: string | null;
  totalCount: number;
  fromDate: string;
  toDate: string;
  timeZone: string;
};
export const billingKey = (account: AccountScope) => storeKey("billing", account);
export const historyKey = (account: AccountScope) => storeKey("history", account);
export async function readBill(
  id: string,
  history: boolean,
  cursor: string | null,
  signal: AbortSignal,
): Promise<BillPage> {
  const path = history ? `/api/owner/history/${id}` : `/api/staff/sessions/${id}/bill`;
  const data = await request<Omit<BillPage, "receivedAt">>(
    path + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
    { signal },
  );
  return { ...data, receivedAt: Date.now() };
}
export function readHistory(filters: HistoryFilters, cursor: string | null, signal: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return request<HistoryPage>(`/api/owner/history?${params}`, { signal });
}
