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

// The first language's name input, where a form without any name is fixed.
export const firstName = (form: HTMLFormElement) =>
  form.elements.namedItem(`name${languages[0].suffix}`) as Element | null;

// Save sits in the editor's sticky footer, so a failed check brings the field to fix into the middle
// of the sheet and focuses it.
export function reveal(field: Element | null) {
  if (!(field instanceof HTMLElement)) return;
  field.scrollIntoView({ block: "center", behavior: "smooth" });
  field.focus({ preventScroll: true });
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
