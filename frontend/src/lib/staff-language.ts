import { isLanguage, type Language } from "./language.ts";

// Store pages (OWNER and STAFF) and platform pages share one interface language, in Chinese, Italian
// or English. The choice is a device preference, like the kitchen sound: shared tablets keep it for
// everyone. Without a stored choice, pages follow the browser's languages, and English otherwise.
export const staffLanguageKey = "tavoloflow:staff-language";

// The first browser language we support, by primary subtag: "zh-TW" is Chinese, "it-IT" Italian.
export function browserLanguage(languages: readonly string[]): Language {
  for (const tag of languages) {
    const primary = tag.split("-")[0].toLowerCase();
    if (isLanguage(primary)) return primary;
  }
  return "en";
}

export function readStaffLanguage(
  storage: Pick<Storage, "getItem"> | null,
  browserLanguages: readonly string[] = [],
): Language {
  try {
    const value = storage?.getItem(staffLanguageKey);
    if (isLanguage(value)) return value;
  } catch {
    /* Blocked storage: fall back to the browser's choice. */
  }
  return browserLanguage(browserLanguages);
}

export function saveStaffLanguage(language: Language, storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(staffLanguageKey, language);
  } catch {
    /* The choice still applies to this page without storage. */
  }
}

const htmlLanguages: Record<Language, string> = { zh: "zh-CN", it: "it", en: "en" };

// The value for <html lang>, so screen readers and fonts pick the right language.
export function htmlLang(language: Language) {
  return htmlLanguages[language];
}
