import { isLanguage, type Language } from "../../lib/language.ts";

export function selectedLanguage(preference: string | null, fallback: Language): Language {
  return isLanguage(preference) ? preference : fallback;
}

export function languageStorageKey(restaurantId: string) {
  return `tavoloflow:menu-language:${restaurantId}`;
}

export function readLanguage(
  restaurantId: string,
  storage: Pick<Storage, "getItem"> | (() => Pick<Storage, "getItem">),
): Language | null {
  try {
    const value = (typeof storage === "function" ? storage() : storage).getItem(
      languageStorageKey(restaurantId),
    );
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLanguage(
  restaurantId: string,
  language: Language,
  storage: Pick<Storage, "setItem"> | (() => Pick<Storage, "setItem">),
) {
  try {
    (typeof storage === "function" ? storage() : storage).setItem(
      languageStorageKey(restaurantId),
      language,
    );
  } catch {
    /* Browsing works without storage. */
  }
}
