import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { Menu, MenuOption, OptionGroup } from "./api";
import { allergenLabel, menuMessages } from "./messages";
import { optionTemplates, type OptionTemplate } from "./option-templates";

// The restaurant's shared option groups, in the order guests see them on every dish. STAFF can mark an
// option sold out; OWNER also edits, deletes and reorders the groups.
export function OptionGroups({
  menu,
  owner,
  disabled,
  toggle,
  edit,
  remove,
  move,
}: {
  menu: Menu;
  owner: boolean;
  disabled: boolean;
  toggle: (option: MenuOption) => void;
  edit: (group: OptionGroup) => void;
  remove: (group: OptionGroup, dishes: number) => void;
  move: (index: number, by: number) => void;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  if (menu.optionGroups.length === 0)
    return <EmptyState icon={ListChecks} title={m.noOptionGroups} />;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {menu.optionGroups.map((group, index) => {
        const name = displayName(group, menu.defaultLanguage, language).text;
        const dishes = menu.items.filter((item) => item.optionGroupIds.includes(group.id)).length;
        return (
          <li
            key={group.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
          >
            <div className="space-y-1">
              <h3 className="font-semibold wrap-break-word">{name}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{m.rule(group.minSelect, group.maxSelect)}</Badge>
                <span className="text-xs text-muted-foreground">{m.usedByCount(dishes)}</span>
              </div>
            </div>
            <ul className="divide-y border-y">
              {group.options.map((option) => {
                const optionName = displayName(option, menu.defaultLanguage, language).text;
                return (
                  <li key={option.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium wrap-break-word",
                          !option.isAvailable && "text-muted-foreground",
                        )}
                      >
                        {optionName}
                        {option.priceDeltaCents > 0 && (
                          <span className="ml-2 text-muted-foreground tabular-nums">
                            +{formatMoney(option.priceDeltaCents, language)}
                          </span>
                        )}
                      </p>
                      {option.allergenCodes.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {option.allergenCodes
                            .map((code) =>
                              allergenLabel(
                                menu.allergens.find((x) => x.code === code) ?? {
                                  code,
                                  label: code,
                                },
                                language,
                              ),
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium whitespace-nowrap",
                        option.isAvailable ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {option.isAvailable ? m.available : m.soldOut}
                    </span>
                    <Switch
                      aria-label={m.optionAvailability(`${name} · ${optionName}`)}
                      checked={option.isAvailable}
                      disabled={disabled}
                      onCheckedChange={() => toggle(option)}
                    />
                  </li>
                );
              })}
            </ul>
            {owner && (
              <div className="mt-auto flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.moveUp(name)}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.moveDown(name)}
                  disabled={disabled || index === menu.optionGroups.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    aria-label={m.editOf(name)}
                    onClick={() => edit(group)}
                  >
                    <Pencil />
                    {m.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    aria-label={m.removeOf(name)}
                    onClick={() => remove(group, dishes)}
                  >
                    <Trash2 />
                    {m.remove}
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The first step of a new group: a template with its names already translated, or a blank group.
export function TemplatePicker({
  choose,
}: {
  choose: (template: OptionTemplate | undefined) => void;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  return (
    <div className="space-y-4 pb-6">
      <p className="text-sm leading-6 text-muted-foreground">{m.templateHint}</p>
      <ul className="grid gap-2">
        {optionTemplates.map((template) => (
          <li key={template.key}>
            <button
              type="button"
              className="flex min-h-11 w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => choose(template)}
            >
              <span className="font-medium">
                {displayName(template.names, language, language).text}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {m.rule(template.minSelect, template.maxSelect)} ·{" "}
                {template.options
                  .map((names) => displayName(names, language, language).text)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
        <li>
          <Button variant="outline" className="w-full" onClick={() => choose(undefined)}>
            <Plus />
            {m.blankTemplate}
          </Button>
        </li>
      </ul>
    </div>
  );
}
