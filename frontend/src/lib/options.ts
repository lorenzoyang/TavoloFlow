import { displayName, type Language, type Names } from "./language.ts";

// An order line's option snapshot, as the API returns it.
export type OptionSnapshot = Names & {
  groupNameZh: string | null;
  groupNameIt: string | null;
  groupNameEn: string | null;
  priceDeltaCents: number;
};

const punctuation: Record<Language, { label: string; list: string }> = {
  zh: { label: "：", list: "、" },
  it: { label: ": ", list: ", " },
  en: { label: ": ", list: ", " },
};

// "杯型：大杯 · 小料：珍珠、椰果": options arrive in display order, so each group's options are adjacent.
// Every name resolves through the usual fallback, with the viewer's language first.
export function optionSummary(
  options: readonly OptionSnapshot[],
  defaultLanguage: Language,
  language?: Language,
): string {
  const marks = punctuation[language ?? defaultLanguage];
  const parts: { group: string; names: string[] }[] = [];
  for (const option of options) {
    const group = displayName(
      { nameZh: option.groupNameZh, nameIt: option.groupNameIt, nameEn: option.groupNameEn },
      defaultLanguage,
      language,
    ).text;
    const name = displayName(option, defaultLanguage, language).text;
    const last = parts.at(-1);
    if (last && last.group === group) last.names.push(name);
    else parts.push({ group, names: [name] });
  }
  return parts
    .map(({ group, names }) => `${group}${marks.label}${names.join(marks.list)}`)
    .join(" · ");
}

// "大杯 · 珍珠": the guest's own fresh choice, where the group names would only repeat the picker.
export function optionNames(
  options: readonly Names[],
  defaultLanguage: Language,
  language?: Language,
): string {
  return options.map((option) => displayName(option, defaultLanguage, language).text).join(" · ");
}
