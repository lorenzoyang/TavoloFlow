import { queryOptions } from "@tanstack/react-query";
import type { AccountScope } from "@/features/accounts/api";
import { request, write } from "@/lib/api";
import { storeKey } from "@/lib/store-views";

export type RestaurantTable = {
  id: string;
  tableLabel: string;
  isEnabled: boolean;
  qrPath: string;
  activeSessionId: string | null;
};

export const tablesKey = (account: AccountScope) => storeKey("tables", account);
export const tablesQuery = (account: AccountScope) =>
  queryOptions({
    queryKey: tablesKey(account),
    queryFn: ({ signal }) => request<RestaurantTable[]>("/api/staff/tables", { signal }),
  });

// Renaming and enabling each change only their own field; the QR token never changes.
export const createTable = (tableLabel: string) =>
  write<RestaurantTable>("/api/owner/tables", "POST", { tableLabel });
export const renameTable = (id: string, tableLabel: string) =>
  write<RestaurantTable>(`/api/owner/tables/${id}/label`, "PATCH", { tableLabel });
export const setTableEnabled = (id: string, isEnabled: boolean) =>
  write<RestaurantTable>(`/api/owner/tables/${id}/enabled`, "PATCH", { isEnabled });
export const deleteTable = (id: string) => write<void>(`/api/owner/tables/${id}`, "DELETE");
