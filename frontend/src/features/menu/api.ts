import { queryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api";
import type { CurrentAccount } from "@/features/accounts/api";

export type Language = "zh" | "it" | "en";
export type Names = { nameZh: string | null; nameIt: string | null; nameEn: string | null };
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

export function displayName(names: Names, fallback: Language) {
  const values = { zh: names.nameZh, it: names.nameIt, en: names.nameEn };
  const language = (["zh", fallback, "it", "en"] as const).find(key => values[key]?.trim()) ?? "zh";
  return { text: values[language] ?? "", language };
}

// Parse base-10 digits as integers: never round a binary floating-point euro amount.
export function parsePrice(value: string): number | null {
  const match = /^(\d{1,14})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function priceText(cents: number): string {
  const amount = BigInt(cents);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}
