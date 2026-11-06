import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import { storeKey } from "@/lib/store-views";
import type { Language, Names } from "@/lib/language";

export type PassItem = Names & {
  id: string;
  orderId: string;
  sessionId: string;
  tableLabel: string;
  defaultLanguage: Language;
  itemCode: string | null;
  quantity: number;
  remark: string | null;
  readyAt: string;
  servedAt: string | null;
};
export type PassPage = {
  items: PassItem[];
  nextCursor: string | null;
  totalCount: number;
  // The newest waiting dish's ready time, restaurant-wide; it advances only when a dish is made ready.
  latestReadyAt: string | null;
  receivedAt: number;
};
export const passKey = (account: AccountScope) => storeKey("pass", account);

export async function readPass(cursor: string | null, signal: AbortSignal): Promise<PassPage> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const result = await request<Omit<PassPage, "receivedAt">>(`/api/staff/pass?${params}`, {
    signal,
  });
  return { ...result, receivedAt: Date.now() };
}

// Only a READY dish not yet served is accepted; a repeat or a lost race returns ORDER_ITEM_CHANGED.
export async function markServed(item: Pick<PassItem, "id" | "orderId">, signal: AbortSignal) {
  const result = await write<PassItem>(
    `/api/staff/orders/${item.orderId}/items/${item.id}/served`,
    "POST",
    {},
    signal,
  );
  if (result.id !== item.id || typeof result.servedAt !== "string")
    throw new Error("Invalid pass response");
  return result;
}
