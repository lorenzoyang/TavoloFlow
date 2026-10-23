import { queryOptions } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { request, write } from "@/lib/api";

export type RestaurantTable = {
  id: string;
  tableLabel: string;
  isEnabled: boolean;
  qrPath: string;
  activeSessionId: string | null;
};

export const tablesKey = (account: CurrentAccount) => ["tables", account.restaurantId, account.userId] as const;
export const tablesQuery = (account: CurrentAccount) => queryOptions({
  queryKey: tablesKey(account),
  queryFn: ({ signal }) => request<RestaurantTable[]>("/api/staff/tables", { signal }),
});

// Renaming and enabling each change only their own field; the QR token never changes.
export const createTable = (tableLabel: string) => write<RestaurantTable>("/api/owner/tables", "POST", { tableLabel });
export const renameTable = (id: string, tableLabel: string) =>
  write<RestaurantTable>(`/api/owner/tables/${id}/label`, "PATCH", { tableLabel });
export const setTableEnabled = (id: string, isEnabled: boolean) =>
  write<RestaurantTable>(`/api/owner/tables/${id}/enabled`, "PATCH", { isEnabled });
export const deleteTable = (id: string) => write<void>(`/api/owner/tables/${id}`, "DELETE");
