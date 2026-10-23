import { queryOptions } from "@tanstack/react-query";
import { request, write } from "@/lib/api";
import type { CurrentAccount } from "@/features/accounts/api";
import type { Language, Names } from "@/lib/language";

export type Category = Names & { id: string };
export type MenuItem = Names & {
  id: string;
  categoryId: string;
  itemCode: string | null;
  descriptionZh: string | null;
  descriptionIt: string | null;
  descriptionEn: string | null;
  priceCents: number;
  allergenCodes: string[];
  allergenReviewed: boolean;
  isAvailable: boolean;
};
export type Menu = {
  restaurantId: string;
  defaultLanguage: Language;
  availableLanguages: Language[];
  categories: Category[];
  items: MenuItem[];
  allergens: { code: string; label: string; description: string }[];
};
export const menuQuery = (account: CurrentAccount) => queryOptions({
  queryKey: ["menu", account.restaurantId, account.userId] as const,
  queryFn: ({ signal }) => request<Menu>("/api/staff/menu", { signal }),
});

// OWNER writes replace the whole category/item (last write wins); availability is a separate STAFF field.
export const saveCategory = (id: string | undefined, body: unknown) =>
  write<Category>(`/api/owner/menu/categories${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body);

export const saveItem = (id: string | undefined, body: unknown) =>
  write<MenuItem>(`/api/owner/menu/items${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body);

export const deleteMenuEntry = (resource: "categories" | "items", id: string) =>
  write<void>(`/api/owner/menu/${resource}/${id}`, "DELETE");

export const setItemAvailability = (id: string, isAvailable: boolean) =>
  write<MenuItem>(`/api/staff/menu-items/${id}/availability`, "PATCH", { isAvailable });

export const setDefaultLanguage = (defaultLanguage: string) =>
  write<{ defaultLanguage: Language }>("/api/owner/menu/default-language", "PATCH", { defaultLanguage });
