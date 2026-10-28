import { guestKeys } from "@/features/guests/api";
import { guestRequest, guestWrite } from "@/lib/api";
import type { Language, Names } from "@/lib/language";
import type { OrderInput } from "./state";

export type OrderItemStatus = "NEW" | "READY" | "CANCELLED";

export type OrderLine = Names & {
  id: string;
  menuItemId: string | null;
  itemCode: string | null;
  allergenCodes: string[];
  unitPriceCents: number;
  quantity: number;
  remark: string | null;
  status: OrderItemStatus;
  readyAt: string | null;
  cancelledAt: string | null;
};
export type Order = {
  id: string;
  sessionId: string;
  status: "NEW" | "PROCESSED";
  createdAt: string;
  defaultLanguage: Language;
  totalAmountCents: number;
  payableAmountCents: number;
  items: OrderLine[];
};
type OrderPage = { items: Order[]; nextCursor: string | null; totalAmountCents: number };
export const ordersKey = (restaurantId: string, tableId: string, sessionId: string) =>
  [...guestKeys.visit(restaurantId, tableId, sessionId), "orders"] as const;
export const readOrders = (sessionId: string, cursor: string | null, signal: AbortSignal) =>
  guestRequest<OrderPage>(
    `/api/public/sessions/${sessionId}/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { signal },
  );

// The same clientRequestId never creates a second order: a retry returns the original (200, not 201).
export const createOrder = (input: OrderInput, signal: AbortSignal) =>
  guestWrite<Order>("/api/public/orders", input, signal);
export const readOrderByRequest = (
  sessionId: string,
  clientRequestId: string,
  signal: AbortSignal,
) =>
  guestRequest<Order>(`/api/public/sessions/${sessionId}/orders/by-request/${clientRequestId}`, {
    signal,
  });
