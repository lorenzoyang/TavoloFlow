import type { Language } from "../../lib/language.ts";

export function selectedLanguage(preference: string | null, fallback: Language): Language {
  return preference === "zh" || preference === "it" || preference === "en" ? preference : fallback;
}

export function languageStorageKey(restaurantId: string) {
  return `tavoloflow:menu-language:${restaurantId}`;
}

export function readLanguage(restaurantId: string, storage: Pick<Storage, "getItem">): Language | null {
  try {
    const value = storage.getItem(languageStorageKey(restaurantId));
    return value === "zh" || value === "it" || value === "en" ? value : null;
  } catch { return null; }
}

export function saveLanguage(restaurantId: string, language: Language, storage: Pick<Storage, "setItem">) {
  try { storage.setItem(languageStorageKey(restaurantId), language); } catch { /* Browsing works without storage. */ }
}
