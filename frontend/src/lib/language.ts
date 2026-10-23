export type Language = "zh" | "it" | "en";
export type Names = { nameZh: string | null; nameIt: string | null; nameEn: string | null };

export const LANGUAGES: readonly Language[] = ["zh", "it", "en"];

export function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "it" || value === "en";
}

// An explicit viewer choice takes precedence over the restaurant's persistent preference.
export function displayName(names: Names, defaultLanguage: Language, selectedLanguage?: Language) {
  const values = { zh: names.nameZh, it: names.nameIt, en: names.nameEn };
  const priority = new Set<Language>([
    ...(selectedLanguage ? [selectedLanguage] : []),
    defaultLanguage,
    "it",
    "zh",
    "en",
  ]);
  const language = [...priority].find((key) => values[key]?.trim()) ?? defaultLanguage;
  return { text: values[language]?.trim() ?? "", language };
}
