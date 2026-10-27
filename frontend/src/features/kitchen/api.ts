import type { AccountScope } from "@/features/accounts/api";
import type { Order } from "@/features/orders/api";
import { confirmedOrder } from "@/features/orders/response";
import { request, write } from "@/lib/api";
import type { OrderStatus } from "./state";

export type KitchenOrder = Order & {
  tableLabel: string;
  processedAt: string | null;
};
export type KitchenPage = {
  items: KitchenOrder[];
  nextCursor: string | null;
  totalCount: number;
  pendingCount: number;
  createdOrderCount: number;
  receivedAt: number;
};
export const kitchenKey = (account: AccountScope) =>
  ["kitchen", account.restaurantId, account.userId] as const;
export async function readKitchen(
  status: OrderStatus,
  cursor: string | null,
  signal: AbortSignal,
): Promise<KitchenPage> {
  const params = new URLSearchParams({ status });
  if (cursor) params.set("cursor", cursor);
  const result = await request<Omit<KitchenPage, "receivedAt">>(`/api/staff/orders?${params}`, {
    signal,
  });
  return { ...result, receivedAt: Date.now() };
}
function confirmedKitchenOrder(order: KitchenOrder, id: string) {
  confirmedOrder(order, order.sessionId);
  if (
    order.id !== id ||
    typeof order.tableLabel !== "string" ||
    (order.status === "NEW"
      ? order.processedAt !== null
      : typeof order.processedAt !== "string" || !Number.isFinite(Date.parse(order.processedAt)))
  )
    throw new Error("Invalid kitchen order response");
  return order;
}
export const readKitchenOrder = async (id: string, signal: AbortSignal) =>
  confirmedKitchenOrder(await request<KitchenOrder>(`/api/staff/orders/${id}`, { signal }), id);

// Both transitions only accept NEW items. A lost race returns ORDER_ITEM_CHANGED.
export const markReady = async (id: string, itemId: string, signal: AbortSignal) =>
  confirmedKitchenOrder(
    await write<KitchenOrder>(`/api/staff/orders/${id}/items/${itemId}/ready`, "POST", {}, signal),
    id,
  );
export const cancelItem = async (id: string, itemId: string, signal: AbortSignal) =>
  confirmedKitchenOrder(
    await write<KitchenOrder>(`/api/staff/orders/${id}/items/${itemId}/cancel`, "POST", {}, signal),
    id,
  );
