import { queryOptions } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { request } from "@/lib/api";

export type RestaurantTable = {
  id: string;
  tableLabel: string;
  isEnabled: boolean;
  qrPath: string;
  activeSessionId: string | null;
};

export const tablesQuery = (account: CurrentAccount) => queryOptions({
  queryKey: ["tables", account.restaurantId, account.userId] as const,
  queryFn: ({ signal }) => request<RestaurantTable[]>("/api/staff/tables", { signal }),
});
