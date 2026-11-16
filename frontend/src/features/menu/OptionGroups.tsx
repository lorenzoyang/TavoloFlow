import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { Menu, MenuOption, OptionGroup } from "./api";
import { optionPreview } from "./form-values";
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
  result,
}: {
  menu: Menu;
  owner: boolean;
  disabled: boolean;
  toggle: (group: OptionGroup, option: MenuOption) => void;
  edit: (group: OptionGroup) => void;
  remove: (group: OptionGroup, dishes: number) => void;
  move: (index: number, by: number) => void;
  // The outcome of the last switch or move in this group, shown in its own card.
  result: (groupId: string) => ReactNode;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  if (menu.optionGroups.length === 0)
    return <EmptyState icon={ListChecks} title={m.noOptionGroups} />;
  // items-start: an open card does not stretch the one beside it on wide screens.
  return (
    <ul className="grid items-start gap-3 lg:grid-cols-2">
      {menu.optionGroups.map((group, index) => (
        <GroupCard
          key={group.id}
          menu={menu}
          group={group}
          index={index}
          owner={owner}
          disabled={disabled}
          toggle={toggle}
          edit={edit}
          remove={remove}
          move={move}
          result={result}
        />
      ))}
    </ul>
  );
}

// One group's card. It starts collapsed, so long groups do not bury the ones below; the header still
// counts the options and the sold-out ones, a reminder to turn them back on. Opening is local view state,
// never remembered: each visit starts from the overview.
function GroupCard({
  menu,
  group,
  index,
  owner,
  disabled,
  toggle,
  edit,
  remove,
  move,
  result,
}: {
  menu: Menu;
  group: OptionGroup;
  index: number;
  owner: boolean;
  disabled: boolean;
  toggle: (group: OptionGroup, option: MenuOption) => void;
  edit: (group: OptionGroup) => void;
  remove: (group: OptionGroup, dishes: number) => void;
  move: (index: number, by: number) => void;
  result: (groupId: string) => ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const name = displayName(group, menu.defaultLanguage, language).text;
  const dishes = menu.items.filter((item) => item.optionGroupIds.includes(group.id)).length;
  const soldOut = group.options.filter((option) => !option.isAvailable).length;
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          className="flex min-h-11 w-full items-start gap-3 rounded-xl text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setOpen(!open)}
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-semibold wrap-break-word">{name}</span>
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{m.rule(group.minSelect, group.maxSelect)}</Badge>
              <span className="text-xs text-muted-foreground">{m.usedByCount(dishes)}</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              {m.optionCount(group.options.length)}
              {soldOut > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">{m.soldOutCount(soldOut)}</span>
                </>
              )}
            </span>
          </span>
          <ChevronDown
            className={cn("mt-0.5 size-5 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
      </h3>
      {open && (
        <ul id={id} className="divide-y border-y">
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
                  onCheckedChange={() => toggle(group, option)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {owner && (
        <div className="flex flex-wrap items-center gap-1">
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
      {result(group.id)}
    </li>
  );
}

// The first step of a new group: a template with its names already translated, a blank group, or a
// copy of one of the restaurant's groups, for the same options under another rule or other prices.
export function TemplatePicker({
  menu,
  choose,
  copy,
}: {
  menu: Menu;
  choose: (template: OptionTemplate | undefined) => void;
  copy: (group: OptionGroup) => void;
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
      {menu.optionGroups.length > 0 && (
        <section aria-labelledby="copy-group" className="space-y-2 pt-2">
          <h3 id="copy-group" className="font-medium">
            {m.copyTitle}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">{m.copyHint}</p>
          <ul className="grid gap-2">
            {menu.optionGroups.map((group) => (
              <li key={group.id}>
                {/* The rule and options tell apart groups with the same name. */}
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => copy(group)}
                >
                  <span className="max-w-full font-medium wrap-break-word">
                    {displayName(group, menu.defaultLanguage, language).text}
                  </span>
                  <span className="max-w-full text-xs leading-5 wrap-break-word text-muted-foreground">
                    {m.rule(group.minSelect, group.maxSelect)} ·{" "}
                    {optionPreview(group, menu, language)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
