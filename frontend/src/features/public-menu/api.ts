import { queryOptions } from "@tanstack/react-query";
import { ApiError, publicRequest } from "@/lib/api";
import type { Category, MenuItem } from "@/features/menu/api";
import type { Language } from "@/lib/language";

export type PublicMenu = {
  restaurant: { id: string; name: string; currencyCode: string; defaultLanguage: Language;
    serviceStatus: "ACTIVE" | "SUSPENDED"; orderingEnabled: boolean };
  table: { id: string; tableLabel: string; isEnabled: boolean };
  activeSessionId: string | null;
  menu: { availableLanguages: Language[]; categories: Category[]; items: MenuItem[] };
};

export const publicMenuQuery = (token: string) => queryOptions({
  queryKey: ["public", "qr", token] as const,
  refetchInterval: 30_000,
  queryFn: async ({ signal }): Promise<PublicMenu | null> => {
    try {
      return await publicRequest<PublicMenu>(`/api/public/qr/${encodeURIComponent(token)}/bootstrap`, { signal });
    } catch (error) {
      // A confirmed invalid entrance replaces cached data. Network failures retain it with a warning.
      if (error instanceof ApiError && error.code === "QR_NOT_FOUND") return null;
      throw error;
    }
  },
});
