import type { MenuItem, MenuOption, OptionGroup } from "../menu/api.ts";
import type { Names } from "../../lib/language.ts";

// Pure, node-tested option rules shared by the guest's option picker and the cart. The server applies the
// same rules again when the order arrives (OrderOptions.Resolve).

// What a cart line keeps of each chosen option, like the dish snapshot it keeps.
export type ChosenOption = Names & { id: string; groupId: string; priceDeltaCents: number };
export type SelectionIssue = "missing" | "tooMany" | "unavailable" | "unknown";
type Dish = Pick<MenuItem, "optionGroupIds">;

// The dish's groups in the restaurant-wide order.
export function itemGroups(item: Dish, groups: readonly OptionGroup[]): OptionGroup[] {
  const ids = new Set(item.optionGroupIds);
  return groups.filter((group) => ids.has(group.id));
}

const picked = (group: OptionGroup, chosen: ReadonlySet<string>) =>
  group.options.filter((option) => chosen.has(option.id));

// The required groups that still lack choices, in display order.
export function missingGroups(
  item: Dish,
  groups: readonly OptionGroup[],
  optionIds: readonly string[],
): OptionGroup[] {
  const chosen = new Set(optionIds);
  return itemGroups(item, groups).filter((group) => picked(group, chosen).length < group.minSelect);
}

// Null when the choice fits the dish's current groups.
export function selectionIssue(
  item: Dish,
  groups: readonly OptionGroup[],
  optionIds: readonly string[],
): SelectionIssue | null {
  const chosen = new Set(optionIds);
  if (chosen.size !== optionIds.length) return "unknown";
  let matched = 0;
  let issue: SelectionIssue | null = null;
  for (const group of itemGroups(item, groups)) {
    const options = picked(group, chosen);
    matched += options.length;
    if (options.some((option) => !option.isAvailable)) issue ??= "unavailable";
    else if (options.length > group.maxSelect) issue ??= "tooMany";
    else if (options.length < group.minSelect) issue ??= "missing";
  }
  return matched === chosen.size ? issue : "unknown";
}

// The chosen options in display order: group order, then each option's order within its group.
export function chosenOptions(
  item: Dish,
  groups: readonly OptionGroup[],
  optionIds: readonly string[],
): ChosenOption[] {
  const chosen = new Set(optionIds);
  return itemGroups(item, groups).flatMap((group) =>
    picked(group, chosen).map((option) => ({
      id: option.id,
      groupId: option.groupId,
      nameZh: option.nameZh,
      nameIt: option.nameIt,
      nameEn: option.nameEn,
      priceDeltaCents: option.priceDeltaCents,
    })),
  );
}

// The price of one portion with its options. An unsafe sum fails Number.isSafeInteger for the caller.
export function unitPriceCents(
  item: Pick<MenuItem, "priceCents">,
  options: readonly Pick<MenuOption, "priceDeltaCents">[],
): number {
  return Number(
    options.reduce((sum, option) => sum + BigInt(option.priceDeltaCents), BigInt(item.priceCents)),
  );
}

// Every required group still has enough options that aren't sold out.
export function optionsInStock(item: Dish, groups: readonly OptionGroup[]): boolean {
  return itemGroups(item, groups).every(
    (group) => group.options.filter((option) => option.isAvailable).length >= group.minSelect,
  );
}

export function orderable(
  item: Pick<MenuItem, "isAvailable" | "allergenReviewed" | "optionGroupIds">,
  groups: readonly OptionGroup[],
): boolean {
  return item.isAvailable && item.allergenReviewed && optionsInStock(item, groups);
}

// Some option costs extra, so the menu shows the dish's price as a starting price.
export function hasExtraCost(item: Dish, groups: readonly OptionGroup[]): boolean {
  return itemGroups(item, groups).some((group) =>
    group.options.some((option) => option.priceDeltaCents > 0),
  );
}

// The dish's allergens followed by the chosen options' own, without repeats.
export function combinedAllergens(
  item: Pick<MenuItem, "allergenCodes">,
  options: readonly Pick<MenuOption, "allergenCodes">[],
): string[] {
  return [
    ...new Set([...item.allergenCodes, ...options.flatMap((option) => option.allergenCodes)]),
  ];
}
