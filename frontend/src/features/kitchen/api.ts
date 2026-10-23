import type { AccountScope } from "@/features/accounts/api";
import type { Order } from "@/features/orders/api";
import { request, write } from "@/lib/api";
import type { OrderStatus } from "./state";

export type KitchenOrder = Order & {
  tableLabel: string;
  readyAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
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
export const readKitchenOrder = (id: string, signal: AbortSignal) =>
  request<KitchenOrder>(`/api/staff/orders/${id}`, { signal });

// Both transitions are conditional on the status the cook saw; a lost race returns ORDER_CHANGED.
export const markReady = (id: string, signal: AbortSignal) =>
  write<KitchenOrder>(`/api/staff/orders/${id}/ready`, "POST", {}, signal);
export const cancelOrder = (
  id: string,
  expectedStatus: "NEW" | "READY",
  reason: string,
  signal: AbortSignal,
) =>
  write<KitchenOrder>(`/api/staff/orders/${id}/cancel`, "POST", { expectedStatus, reason }, signal);
