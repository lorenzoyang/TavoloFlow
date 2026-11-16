import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { formatCents, parsePrice } from "@/lib/format";
import { displayName } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { Menu, OptionGroup } from "./api";
import { firstName, namesFrom, reveal } from "./form-values";
import { Actions, AllergenChecks, Errors, NameFields, type FormProps } from "./MenuForms";
import { languages, menuMessages } from "./messages";
import type { OptionTemplate } from "./option-templates";

const MAX_OPTIONS = 30;
// Option names are shorter than dish names (150), so a name taken from a dish is cut to fit.
const MAX_OPTION_NAME = 100;

// One editable option. The id stays with an existing option, so the server keeps it (and its sold-out
// state); the key only identifies the row while editing.
type Row = {
  key: string;
  id: string | null;
  nameZh: string;
  nameIt: string;
  nameEn: string;
  price: string;
  allergenCodes: string[];
  open: boolean;
};

let rowKey = 0;
const nextKey = () => `row-${++rowKey}`;
const newRow = (): Row => ({
  key: nextKey(),
  id: null,
  nameZh: "",
  nameIt: "",
  nameEn: "",
  price: "0",
  allergenCodes: [],
  open: false,
});

// A new group starts with one untouched blank row: the first options taken from dishes replace it.
function isBlankStart(rows: Row[]) {
  const [only] = rows;
  return (
    rows.length === 1 &&
    only.id === null &&
    ![only.nameZh, only.nameIt, only.nameEn].some((name) => name.trim()) &&
    only.price === "0" &&
    only.allergenCodes.length === 0
  );
}

// An existing group's options. A copy drops their ids, so saving creates new options and leaves the
// original group untouched.
const rowsOf = (group: OptionGroup, keepIds: boolean): Row[] =>
  group.options.map((option) => ({
    key: nextKey(),
    id: keepIds ? option.id : null,
    nameZh: option.nameZh ?? "",
    nameIt: option.nameIt ?? "",
    nameEn: option.nameEn ?? "",
    price: formatCents(option.priceDeltaCents),
    allergenCodes: option.allergenCodes,
    open: false,
  }));

function initialRows(
  initial?: OptionGroup,
  copyOf?: OptionGroup,
  template?: OptionTemplate,
): Row[] {
  if (initial) return rowsOf(initial, true);
  if (copyOf) return rowsOf(copyOf, false);
  if (template)
    return template.options.map((names) => ({
      ...newRow(),
      nameZh: names.nameZh ?? "",
      nameIt: names.nameIt ?? "",
      nameEn: names.nameEn ?? "",
    }));
  return [newRow()];
}

// A whole option group: its names, rule, options and the dishes that use it, saved in one request. A
// new group may start from a template or from a copy of an existing group (copyOf).
export function OptionGroupForm({
  initial,
  copyOf,
  template,
  menu,
  busy,
  error,
  cancel,
  save,
  feedback,
}: FormProps & {
  initial?: OptionGroup;
  copyOf?: OptionGroup;
  template?: OptionTemplate;
  menu: Menu;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const source = initial ?? copyOf ?? template;
  const [rows, setRows] = useState(() => initialRows(initial, copyOf, template));
  const [required, setRequired] = useState((source?.minSelect ?? 1) > 0);
  const [max, setMax] = useState(source?.maxSelect ?? 1);
  const [dishes, setDishes] = useState(() =>
    initial ? menu.items.filter((i) => i.optionGroupIds.includes(initial.id)).map((i) => i.id) : [],
  );
  // An existing group was reviewed when it was last saved, as a dish keeps its review; changing an
  // option's allergens or adding an option asks for a new review. A copy is a new group: its dishes
  // start empty and it needs its own review.
  const [reviewed, setReviewed] = useState(initial !== undefined);
  const [validation, setValidation] = useState("");
  const reviewBox = useRef<HTMLElement>(null);
  // "Add from dishes": an inline checklist, so several dishes become options in one step.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const pickerId = useId();
  const pickerToggle = useRef<HTMLButtonElement>(null);
  // How many options may still be added; the blank starting row is replaced, so it leaves a slot.
  const remaining = MAX_OPTIONS - rows.length + (isBlankStart(rows) ? 1 : 0);
  const limit = Math.min(max, rows.length);
  const label = (row: Row, index: number) =>
    displayName(
      { nameZh: row.nameZh, nameIt: row.nameIt, nameEn: row.nameEn },
      menu.defaultLanguage,
      language,
    ).text || m.optionNumber(index + 1);

  function edit(index: number, patch: Partial<Row>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function move(index: number, by: number) {
    const next = [...rows];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setRows(next);
  }
  // One option per ticked dish, in menu order whatever order they were ticked in: a one-time copy of
  // the dish's names and allergens, with no extra price. Nothing links the option to the dish
  // afterwards, as with templates and copied groups. A dish deleted meanwhile is skipped.
  function addDishes(ids: string[]) {
    const added = menu.items
      .filter((item) => ids.includes(item.id))
      .map((item) => ({
        ...newRow(),
        nameZh: (item.nameZh ?? "").slice(0, MAX_OPTION_NAME),
        nameIt: (item.nameIt ?? "").slice(0, MAX_OPTION_NAME),
        nameEn: (item.nameEn ?? "").slice(0, MAX_OPTION_NAME),
        allergenCodes: item.allergenCodes,
      }));
    if (!added.length) return;
    setRows(isBlankStart(rows) ? added : [...rows, ...added]);
    setReviewed(false);
  }
  // Closing the picker unmounts the button just pressed, so focus returns to the toggle.
  function closePicker(ids: string[]) {
    addDishes(ids);
    setPicking(false);
    setPicked([]);
    pickerToggle.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const names = namesFrom(new FormData(form));
    function fail(message: string, field: Element | null) {
      setValidation(message);
      reveal(field);
    }
    if (!Object.values(names).some(Boolean)) {
      fail(m.namesInvalid, firstName(form));
      return;
    }
    const unnamed = rows.find(
      (row) => ![row.nameZh, row.nameIt, row.nameEn].some((name) => name.trim()),
    );
    if (rows.length < 1 || rows.length > MAX_OPTIONS || unnamed) {
      fail(
        m.optionsInvalid,
        unnamed ? document.getElementById(`${unnamed.key}-name${languages[0].suffix}`) : null,
      );
      return;
    }
    const prices = rows.map((row) => parsePrice(row.price, true));
    const badPrice = prices.findIndex((price) => price === null);
    if (badPrice >= 0) {
      fail(m.extraPriceInvalid, document.getElementById(`${rows[badPrice].key}-price`));
      return;
    }
    if (!reviewed) {
      fail(m.reviewRequired, reviewBox.current);
      return;
    }
    setValidation("");
    save({
      ...names,
      minSelect: required ? 1 : 0,
      maxSelect: limit,
      options: rows.map((row, index) => ({
        id: row.id,
        nameZh: row.nameZh.trim() || null,
        nameIt: row.nameIt.trim() || null,
        nameEn: row.nameEn.trim() || null,
        priceDeltaCents: prices[index],
        allergenCodes: row.allergenCodes,
      })),
      menuItemIds: dishes,
      allergenReviewed: true,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <FieldDescription>{m.nameHint}</FieldDescription>
      <FieldSet disabled={busy} className="gap-6">
        <NameFields initial={initial ?? copyOf ?? template?.names} error={error} />
        <fieldset className="space-y-3">
          <legend className="mb-3 font-medium">{m.options}</legend>
          <ol className="space-y-3">
            {rows.map((row, index) => {
              const name = label(row, index);
              return (
                <li key={row.key} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium wrap-break-word">{name}</span>
                    <div className="flex shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.moveUp(name)}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.moveDown(name)}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.removeOption(name)}
                        disabled={rows.length === 1}
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {languages.map(({ code, suffix }) => (
                      <Field key={code}>
                        <FieldLabel htmlFor={`${row.key}-name${suffix}`}>
                          {m.nameIn(m.languageNames[code])}
                        </FieldLabel>
                        <Input
                          id={`${row.key}-name${suffix}`}
                          lang={code}
                          maxLength={MAX_OPTION_NAME}
                          value={row[`name${suffix}`]}
                          onChange={(event) =>
                            edit(index, { [`name${suffix}`]: event.target.value })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field className="w-40">
                      <FieldLabel htmlFor={`${row.key}-price`}>{m.extraPrice}</FieldLabel>
                      <Input
                        id={`${row.key}-price`}
                        inputMode="decimal"
                        maxLength={17}
                        value={row.price}
                        onChange={(event) => edit(index, { price: event.target.value })}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      aria-expanded={row.open}
                      onClick={() => edit(index, { open: !row.open })}
                    >
                      {m.optionAllergens(row.allergenCodes.length)}
                      <ChevronDown
                        className={cn("transition-transform", row.open && "rotate-180")}
                      />
                    </Button>
                  </div>
                  {row.open && (
                    <AllergenChecks
                      menu={menu}
                      codes={row.allergenCodes}
                      change={(codes) => {
                        edit(index, { allergenCodes: codes });
                        setReviewed(false);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <FieldDescription>{m.extraPriceHint}</FieldDescription>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={rows.length >= MAX_OPTIONS}
              onClick={() => {
                setRows([...rows, newRow()]);
                setReviewed(false);
              }}
            >
              <Plus />
              {m.addOption}
            </Button>
            {menu.items.length > 0 && (
              <Button
                ref={pickerToggle}
                type="button"
                variant="outline"
                aria-expanded={picking}
                aria-controls={pickerId}
                aria-describedby="add-from-dish-hint"
                disabled={remaining <= 0}
                onClick={() => {
                  setPicking(!picking);
                  setPicked([]);
                }}
              >
                {m.addFromDish}
                <ChevronDown className={cn("transition-transform", picking && "rotate-180")} />
              </Button>
            )}
          </div>
          {picking && (
            <section
              id={pickerId}
              aria-label={m.addFromDish}
              className="space-y-3 rounded-xl border p-3"
            >
              {/* Bounded, so the buttons stay close to the boxes on a long menu. */}
              <div className="max-h-[50dvh] space-y-3 overflow-y-auto">
                <DishChecklist
                  menu={menu}
                  checked={picked}
                  change={setPicked}
                  full={picked.length >= remaining}
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-xs text-muted-foreground">
                  {m.remainingOptions(Math.max(0, remaining - picked.length))}
                </span>
                <Button type="button" variant="ghost" onClick={() => closePicker([])}>
                  {m.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={picked.length === 0}
                  onClick={() => closePicker(picked)}
                >
                  {m.addPicked(picked.length)}
                </Button>
              </div>
            </section>
          )}
          {menu.items.length > 0 && (
            <FieldDescription id="add-from-dish-hint">{m.fromDishHint}</FieldDescription>
          )}
        </fieldset>
        {/* After the options: how many a guest may choose depends on how many there are. */}
        <div className="space-y-4 rounded-xl border p-3">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium">{m.required}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {m.requiredHint}
              </span>
            </span>
            <Switch checked={required} onCheckedChange={setRequired} />
          </label>
          <Field>
            <FieldLabel htmlFor="maxSelect">{m.maxSelect}</FieldLabel>
            <NativeSelect
              id="maxSelect"
              value={String(limit)}
              onChange={(event) => setMax(Number(event.target.value))}
              className="w-full"
            >
              {rows.map((_, index) => (
                <NativeSelectOption key={index} value={String(index + 1)}>
                  {m.maxOption(index + 1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              {rows.length === 1 ? m.moreOptionsForMulti : m.rule(required ? 1 : 0, limit)}
            </FieldDescription>
          </Field>
        </div>
        <div className="space-y-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-warning/60 bg-warning/12 p-3 text-sm font-medium">
            <Checkbox
              ref={reviewBox}
              className="mt-0.5"
              checked={reviewed}
              onCheckedChange={(checked) => setReviewed(checked)}
            />
            {m.reviewOptions}
          </label>
          <FieldDescription>{m.reviewHint}</FieldDescription>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-1 font-medium">{m.usedBy}</legend>
          <FieldDescription>{m.usedByHint}</FieldDescription>
          <DishChecklist menu={menu} checked={dishes} change={setDishes} />
        </fieldset>
        <Errors error={error} />
        <Actions
          busy={busy}
          cancel={cancel}
          message={validation ? <FieldError>{validation}</FieldError> : feedback}
        />
      </FieldSet>
    </form>
  );
}

// The menu's dishes by category, each with a checkbox: the dishes that use the group, or the dishes to
// copy as options. When full, only the ticked boxes stay enabled, so they can still be unticked.
function DishChecklist({
  menu,
  checked,
  change,
  full = false,
}: {
  menu: Menu;
  checked: string[];
  change: (ids: string[]) => void;
  full?: boolean;
}) {
  const language = useStaffLanguage();
  return menu.categories.map((category) => {
    const items = menu.items.filter((item) => item.categoryId === category.id);
    if (!items.length) return null;
    return (
      <div key={category.id} className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {displayName(category, menu.defaultLanguage, language).text}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const ticked = checked.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50"
              >
                <Checkbox
                  checked={ticked}
                  disabled={full && !ticked}
                  onCheckedChange={(value) =>
                    change(value ? [...checked, item.id] : checked.filter((id) => id !== item.id))
                  }
                />
                <span className="min-w-0 wrap-break-word">
                  {displayName(item, menu.defaultLanguage, language).text}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  });
}
