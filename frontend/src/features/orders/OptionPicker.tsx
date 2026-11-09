import { useState, type ReactNode } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import type { MenuItem, MenuOption, OptionGroup } from "@/features/menu/api";
import { allergenNames, messages } from "@/features/public-menu/messages";
import { orderMessages } from "./messages";
import { combinedAllergens, itemGroups, missingGroups, unitPriceCents } from "./options";

type Props = {
  item: MenuItem | null;
  groups: OptionGroup[];
  defaultLanguage: Language;
  language: Language;
  disabled: boolean;
  close: () => void;
  add: (item: MenuItem, optionIds: string[]) => void;
};

// The guest chooses a dish's options before it enters the cart. Required groups start empty: nothing is
// preselected, so every required choice is the guest's own.
export function OptionPicker(props: Props) {
  return (
    <Sheet
      open={props.item !== null}
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[90dvh] w-full max-w-xl gap-0 rounded-t-3xl"
      >
        {props.item && <Choices key={props.item.id} {...props} item={props.item} />}
      </SheetContent>
    </Sheet>
  );
}

function Choices({
  item,
  groups,
  defaultLanguage,
  language,
  disabled,
  add,
}: Props & { item: MenuItem }) {
  const m = orderMessages[language];
  const menu = messages[language];
  const [selected, setSelected] = useState<string[]>([]);
  const own = itemGroups(item, groups);
  const options = own.flatMap((group) => group.options).filter((o) => selected.includes(o.id));
  const missing = missingGroups(item, groups, selected);
  const price = unitPriceCents(item, options);
  const allergens = combinedAllergens(item, options);
  const name = displayName(item, defaultLanguage, language);
  const label = (value: Parameters<typeof displayName>[0]) =>
    displayName(value, defaultLanguage, language);
  const inGroup = (group: OptionGroup) =>
    selected.filter((id) => group.options.some((option) => option.id === id));
  function choose(group: OptionGroup, ids: string[]) {
    const others = selected.filter((id) => !group.options.some((option) => option.id === id));
    setSelected([...others, ...ids]);
  }
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b px-4 pt-5 pb-3">
        <div className="min-w-0 space-y-1">
          <SheetTitle lang={name.language} className="text-lg leading-snug wrap-break-word">
            {name.text}
          </SheetTitle>
          {allergens.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs leading-5">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-warning-foreground"
              />
              <span>
                <span className="font-medium">{menu.allergens}: </span>
                {allergens.map((code) => allergenNames[language][code] ?? code).join(" · ")}
              </span>
            </p>
          )}
        </div>
        <SheetClose
          render={<Button variant="ghost" size="icon" aria-label={m.close} className="-mr-2" />}
        >
          <X />
        </SheetClose>
      </div>
      <div className="space-y-5 overflow-y-auto px-4 py-4">
        {own.map((group) => {
          const groupName = label(group);
          const chosen = inGroup(group);
          const heading = (
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span lang={groupName.language} className="font-semibold wrap-break-word">
                {groupName.text}
              </span>
              <span
                className={cn(
                  "text-sm whitespace-nowrap",
                  missing.includes(group) ? "text-warning-foreground" : "text-muted-foreground",
                )}
              >
                {m.rule(group.minSelect, group.maxSelect)}
                {group.maxSelect > 1 && ` · ${chosen.length}/${group.maxSelect}`}
              </span>
            </span>
          );
          // A required single choice is a radio group; anything else is a checklist with a maximum,
          // where a single optional choice is replaced by tapping another.
          if (group.minSelect > 0 && group.maxSelect === 1)
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="mb-2 w-full">{heading}</legend>
                <RadioGroup
                  value={chosen[0] ?? null}
                  onValueChange={(value) => choose(group, [String(value)])}
                  aria-label={groupName.text}
                >
                  {group.options.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      label={label(option)}
                      language={language}
                      soldOut={menu.soldOut}
                      dimmed={!option.isAvailable}
                      control={<RadioGroupItem value={option.id} disabled={!option.isAvailable} />}
                    />
                  ))}
                </RadioGroup>
              </fieldset>
            );
          return (
            <fieldset key={group.id} className="space-y-2">
              <legend className="mb-2 w-full">{heading}</legend>
              {group.options.map((option) => {
                const checked = chosen.includes(option.id);
                const full = group.maxSelect > 1 && chosen.length >= group.maxSelect;
                // At the maximum, the other options rest until one is unchecked.
                const blocked = !option.isAvailable || (!checked && full);
                return (
                  <OptionRow
                    key={option.id}
                    option={option}
                    label={label(option)}
                    language={language}
                    soldOut={menu.soldOut}
                    dimmed={blocked}
                    control={
                      <Checkbox
                        checked={checked}
                        disabled={blocked}
                        onCheckedChange={(next) =>
                          choose(
                            group,
                            !next
                              ? chosen.filter((id) => id !== option.id)
                              : group.maxSelect === 1
                                ? [option.id]
                                : [...chosen, option.id],
                          )
                        }
                      />
                    }
                  />
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <div className="border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          className="w-full"
          disabled={disabled || missing.length > 0}
          onClick={() => add(item, selected)}
        >
          {missing.length > 0
            ? m.chooseGroups(missing.map((group) => label(group).text).join(" · "))
            : m.addFor(formatMoney(price, language))}
        </Button>
      </div>
    </>
  );
}

function OptionRow({
  option,
  label,
  language,
  soldOut,
  dimmed,
  control,
}: {
  option: MenuOption;
  label: { text: string; language: Language };
  language: Language;
  soldOut: string;
  dimmed: boolean;
  control: ReactNode;
}) {
  const m = orderMessages[language];
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent",
        dimmed && "cursor-not-allowed text-muted-foreground",
      )}
    >
      {control}
      <span className="min-w-0 flex-1">
        <span lang={label.language} className="font-medium wrap-break-word">
          {label.text}
        </span>
        {option.allergenCodes.length > 0 && (
          <span className="block text-xs text-muted-foreground">
            {option.allergenCodes.map((code) => allergenNames[language][code] ?? code).join(" · ")}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {!option.isAvailable
          ? soldOut
          : option.priceDeltaCents > 0 && m.extra(formatMoney(option.priceDeltaCents, language))}
      </span>
    </label>
  );
}
