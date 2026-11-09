import { formatCents } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import type { Menu, OptionGroup } from "./api";
import { languages } from "./messages";

// The trimmed name fields of a menu form, null where left blank.
export function namesFrom(data: FormData) {
  return Object.fromEntries(
    languages.map(({ suffix }) => [
      `name${suffix}`,
      String(data.get(`name${suffix}`) ?? "").trim() || null,
    ]),
  );
}

// "中杯 · 大杯 +1.00": tells apart groups with the same name, such as two size groups priced differently.
export function optionPreview(group: OptionGroup, menu: Menu, language: Language) {
  return group.options
    .map(
      (option) =>
        displayName(option, menu.defaultLanguage, language).text +
        (option.priceDeltaCents > 0 ? ` +${formatCents(option.priceDeltaCents)}` : ""),
    )
    .join(" · ");
}
