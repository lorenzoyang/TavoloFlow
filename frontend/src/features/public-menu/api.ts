import { queryOptions } from "@tanstack/react-query";
import { ApiError, publicRequest } from "@/lib/api";
import type { Category, MenuItem } from "@/features/menu/api";
import type { Language } from "@/lib/language";

export type PublicMenu = {
  restaurant: {
    id: string;
    name: string;
    currencyCode: string;
    defaultLanguage: Language;
    serviceStatus: "ACTIVE" | "SUSPENDED";
    orderingEnabled: boolean;
  };
  table: { id: string; tableLabel: string; isEnabled: boolean };
  activeSessionId: string | null;
  menu: { availableLanguages: Language[]; categories: Category[]; items: MenuItem[] };
};

export const publicMenuKey = (token: string) => ["public", "qr", token] as const;

// Anonymous: no credentials are sent, so browsing never touches a staff or guest identity.
export const readBootstrap = (token: string, signal?: AbortSignal) =>
  publicRequest<PublicMenu>(`/api/public/qr/${encodeURIComponent(token)}/bootstrap`, { signal });

export const publicMenuQuery = (token: string) =>
  queryOptions({
    queryKey: publicMenuKey(token),
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<PublicMenu | null> => {
      try {
        return await readBootstrap(token, signal);
      } catch (error) {
        // A confirmed invalid entrance replaces cached data. Network failures retain it with a warning.
        if (error instanceof ApiError && error.code === "QR_NOT_FOUND") return null;
        throw error;
      }
    },
  });
