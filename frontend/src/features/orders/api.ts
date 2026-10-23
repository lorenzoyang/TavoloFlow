import { guestRequest } from "@/lib/api";
import type { Language, Names } from "@/lib/language";
export { confirmedOrder } from "./response";

export type OrderLine = Names & { id: string; menuItemId: string | null; itemCode: string | null;
  allergenCodes: string[]; unitPriceCents: number; quantity: number; remark: string | null };
export type Order = { id: string; sessionId: string; status: "NEW" | "READY" | "CANCELLED"; createdAt: string;
  defaultLanguage: Language; totalAmountCents: number; orderNote: string | null; items: OrderLine[] };
export type OrderPage = { items: Order[]; nextCursor: string | null; totalAmountCents: number };
export const ordersKey = (restaurantId: string, tableId: string, sessionId: string) =>
  ["guest", restaurantId, tableId, sessionId, "orders"] as const;
export const readOrders = (sessionId: string, cursor: string | null, signal: AbortSignal) =>
  guestRequest<OrderPage>(`/api/public/sessions/${sessionId}/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });

