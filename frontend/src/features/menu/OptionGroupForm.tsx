import { useRef, useState, type FormEvent } from "react";
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

function initialRows(initial?: OptionGroup, template?: OptionTemplate): Row[] {
  if (initial)
    return initial.options.map((option) => ({
      key: nextKey(),
      id: option.id,
      nameZh: option.nameZh ?? "",
      nameIt: option.nameIt ?? "",
      nameEn: option.nameEn ?? "",
      price: formatCents(option.priceDeltaCents),
      allergenCodes: option.allergenCodes,
      open: false,
    }));
  if (template)
    return template.options.map((names) => ({
      ...newRow(),
      nameZh: names.nameZh ?? "",
      nameIt: names.nameIt ?? "",
      nameEn: names.nameEn ?? "",
    }));
  return [newRow()];
}

// A whole option group: its names, rule, options and the dishes that use it, saved in one request.
export function OptionGroupForm({
  initial,
  template,
  menu,
  busy,
  error,
  cancel,
  save,
  feedback,
}: FormProps & { initial?: OptionGroup; template?: OptionTemplate; menu: Menu }) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const source = initial ?? template;
  const [rows, setRows] = useState(() => initialRows(initial, template));
  const [required, setRequired] = useState((source?.minSelect ?? 1) > 0);
  const [max, setMax] = useState(source?.maxSelect ?? 1);
  const [dishes, setDishes] = useState(() =>
    initial ? menu.items.filter((i) => i.optionGroupIds.includes(initial.id)).map((i) => i.id) : [],
  );
  // An existing group was reviewed when it was last saved, as a dish keeps its review; changing an
  // option's allergens or adding an option asks for a new review.
  const [reviewed, setReviewed] = useState(initial !== undefined);
  const [validation, setValidation] = useState("");
  const reviewBox = useRef<HTMLElement>(null);
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
        <NameFields initial={initial ?? template?.names} error={error} />
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
                          maxLength={100}
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
          {menu.categories.map((category) => {
            const items = menu.items.filter((item) => item.categoryId === category.id);
            if (!items.length) return null;
            return (
              <div key={category.id} className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {displayName(category, menu.defaultLanguage, language).text}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
                    >
                      <Checkbox
                        checked={dishes.includes(item.id)}
                        onCheckedChange={(checked) =>
                          setDishes(
                            checked ? [...dishes, item.id] : dishes.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span className="min-w-0 wrap-break-word">
                        {displayName(item, menu.defaultLanguage, language).text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
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
