import type { CurrentAccount } from "@/features/accounts/api";
import type { Order } from "@/features/orders/api";
import { request } from "@/lib/api";
import type { OrderStatus } from "./state";

export type KitchenOrder = Order & { tableLabel: string; readyAt: string | null; cancelledAt: string | null; cancelReason: string | null };
export type KitchenPage = { items: KitchenOrder[]; nextCursor: string | null; totalCount: number;
  pendingCount: number; createdOrderCount: number; receivedAt: number };
export const kitchenKey = (account: Pick<CurrentAccount, "restaurantId" | "userId">) => ["kitchen", account.restaurantId, account.userId] as const;
export async function readKitchen(status: OrderStatus, cursor: string | null, signal: AbortSignal): Promise<KitchenPage> {
  const params = new URLSearchParams({ status });
  if (cursor) params.set("cursor", cursor);
  const result = await request<Omit<KitchenPage, "receivedAt">>(`/api/staff/orders?${params}`, { signal });
  return { ...result, receivedAt: Date.now() };
}
export const readKitchenOrder = (id: string, signal: AbortSignal) => request<KitchenOrder>(`/api/staff/orders/${id}`, { signal });
