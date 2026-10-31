import type { AccountScope } from "@/features/accounts/api";
import type { Order } from "@/features/orders/api";
import { confirmedOrder } from "@/features/orders/response";
import { request, write } from "@/lib/api";
import type { OrderStatus } from "./state";

// How kitchen and pass name a pickup visit: the pickup number first, the name only to help.
export type SessionPickup = { number: number; customerName: string; estimatedReadyAt: string };
export type KitchenOrder = Order & {
  channel: "DINE_IN" | "PICKUP";
  // NULL for pickup visits, which carry pickup instead.
  tableLabel: string | null;
  pickup: SessionPickup | null;
  processedAt: string | null;
};
export type KitchenPage = {
  items: KitchenOrder[];
  nextCursor: string | null;
  totalCount: number;
  pendingCount: number;
  latestCreatedAt: string | null;
  receivedAt: number;
};
export const kitchenKey = (account: AccountScope) =>
  ["kitchen", account.restaurantId, account.userId] as const;
export async function readKitchen(
  status: OrderStatus,
  cursor: string | null,
  signal: AbortSignal,
): Promise<KitchenPage> {
  // The server's maximum page: the dish view can only merge the orders it has loaded.
  const params = new URLSearchParams({ status, limit: "100" });
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
    (order.channel === "DINE_IN"
      ? typeof order.tableLabel !== "string"
      : order.channel !== "PICKUP" || order.tableLabel !== null) ||
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
