import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet } from "@/components/ui/field";
import { ApiError, fieldErrors } from "@/lib/api";
import { formatCents, parsePrice } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { Category, Menu, MenuItem } from "./api";
import type { Names } from "@/lib/language";
import { displayName } from "@/lib/language";
import { allergenLabel, languages, menuMessages } from "./messages";
import { namesFrom, optionPreview } from "./form-values";

export type FormProps = {
  busy: boolean;
  error: unknown;
  cancel: () => void;
  save: (body: unknown) => void;
  feedback: ReactNode;
};

export function Errors({ error }: { error: unknown }) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  if (!(error instanceof ApiError) || Object.keys(error.errors).length === 0) return null;
  return (
    <FieldError>
      <p>{m.fieldError}</p>
      <ul className="list-inside list-disc">
        {Object.entries(fieldErrors(error, language)).map(([field, errors]) => (
          <li key={field}>{errors.join(" ")}</li>
        ))}
      </ul>
    </FieldError>
  );
}

// One block per language: its name and, for dishes, the description in that language.
export function NameFields({
  initial,
  descriptions = false,
  error,
}: {
  initial?: Names & Partial<MenuItem>;
  descriptions?: boolean;
  error: unknown;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const errors = fieldErrors(error, language);
  return (
    <div className="space-y-4">
      {languages.map(({ code, suffix }) => (
        <fieldset key={code} className="space-y-3 rounded-xl border p-3">
          <legend className="px-1 text-sm font-medium text-muted-foreground">
            {m.languageNames[code]}
          </legend>
          <Field>
            <FieldLabel htmlFor={`name${suffix}`}>{m.nameIn(m.languageNames[code])}</FieldLabel>
            <Input
              id={`name${suffix}`}
              name={`name${suffix}`}
              lang={code}
              maxLength={descriptions ? 150 : 100}
              defaultValue={initial?.[`name${suffix}`] ?? ""}
              aria-invalid={!!errors[`name${suffix}`]}
              aria-describedby={errors[`name${suffix}`] ? `name${suffix}-error` : undefined}
            />
            {errors[`name${suffix}`] && (
              <FieldError id={`name${suffix}-error`}>
                {errors[`name${suffix}`].join(" ")}
              </FieldError>
            )}
          </Field>
          {descriptions && (
            <Field>
              <FieldLabel htmlFor={`description${suffix}`}>
                {m.descriptionIn(m.languageNames[code])}
              </FieldLabel>
              <Textarea
                id={`description${suffix}`}
                name={`description${suffix}`}
                lang={code}
                className="min-h-20"
                defaultValue={initial?.[`description${suffix}`] ?? ""}
                aria-invalid={!!errors[`description${suffix}`]}
                aria-describedby={
                  errors[`description${suffix}`] ? `description${suffix}-error` : undefined
                }
              />
              {errors[`description${suffix}`] && (
                <FieldError id={`description${suffix}-error`}>
                  {errors[`description${suffix}`].join(" ")}
                </FieldError>
              )}
            </Field>
          )}
        </fieldset>
      ))}
    </div>
  );
}

// The EU allergen checklist, shared by dishes and their options.
export function AllergenChecks({
  menu,
  codes,
  change,
}: {
  menu: Menu;
  codes: string[];
  change: (codes: string[]) => void;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {menu.allergens.map((option) => (
        <label
          key={option.code}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
        >
          <Checkbox
            className="mt-0.5"
            checked={codes.includes(option.code)}
            onCheckedChange={(checked) =>
              change(
                checked ? [...codes, option.code] : codes.filter((code) => code !== option.code),
              )
            }
          />
          <span>
            {allergenLabel(option, language)}
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {m.allergenHints[option.code] ?? option.description}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

// Stays in view at the bottom of the editor sheet, however long the form is.
export function Actions({ busy, cancel }: Pick<FormProps, "busy" | "cancel">) {
  const m = menuMessages[useStaffLanguage()];
  return (
    <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-3 border-t bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Button type="button" variant="outline" onClick={cancel} disabled={busy}>
        {m.cancel}
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? m.saving : m.save}
      </Button>
    </div>
  );
}

export function CategoryForm({
  initial,
  busy,
  error,
  cancel,
  save,
  feedback,
}: FormProps & { initial?: Category }) {
  const m = menuMessages[useStaffLanguage()];
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const names = namesFrom(new FormData(event.currentTarget));
    if (!Object.values(names).some(Boolean)) {
      setValidation(m.namesInvalid);
      return;
    }
    setValidation("");
    save(names);
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <FieldDescription>{m.nameHint}</FieldDescription>
      <FieldSet disabled={busy} className="gap-5">
        <NameFields initial={initial} error={error} />
        <Errors error={error} />
        {validation && <FieldError>{validation}</FieldError>}
        {feedback}
        <Actions busy={busy} cancel={cancel} />
      </FieldSet>
    </form>
  );
}

export function ItemForm({
  initial,
  menu,
  categoryId,
  busy,
  error,
  cancel,
  save,
  feedback,
}: FormProps & {
  initial?: MenuItem;
  menu: Menu;
  categoryId: string;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const [codes, setCodes] = useState(initial?.allergenCodes ?? []);
  const [reviewed, setReviewed] = useState(initial?.allergenReviewed ?? false);
  const [groupIds, setGroupIds] = useState(initial?.optionGroupIds ?? []);
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const names = namesFrom(data);
    const priceCents = parsePrice(String(data.get("price")));
    if (!Object.values(names).some(Boolean)) {
      setValidation(m.namesInvalid);
      return;
    }
    if (priceCents === null) {
      setValidation(m.priceInvalid);
      return;
    }
    if (!reviewed) {
      setValidation(m.reviewRequired);
      return;
    }
    setValidation("");
    save({
      ...names,
      categoryId: data.get("categoryId"),
      itemCode: data.get("itemCode"),
      priceCents,
      ...Object.fromEntries(
        languages.map(({ suffix }) => [`description${suffix}`, data.get(`description${suffix}`)]),
      ),
      allergenCodes: codes,
      allergenReviewed: reviewed,
      // Sent in the restaurant-wide order; the server keeps that order whatever it receives.
      optionGroupIds: menu.optionGroups.map((g) => g.id).filter((id) => groupIds.includes(id)),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <FieldDescription>{m.nameHint}</FieldDescription>
      <FieldSet disabled={busy} className="gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="categoryId">{m.category}</FieldLabel>
            <NativeSelect
              id="categoryId"
              name="categoryId"
              defaultValue={initial?.categoryId ?? categoryId}
              required
              className="w-full"
            >
              {menu.categories.map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {displayName(category, menu.defaultLanguage, language).text}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="price">{m.price}</FieldLabel>
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              required
              maxLength={17}
              defaultValue={initial ? formatCents(initial.priceCents) : ""}
              aria-describedby="price-hint"
            />
            <FieldDescription id="price-hint">{m.priceHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="itemCode">{m.itemCode}</FieldLabel>
            <Input
              id="itemCode"
              name="itemCode"
              defaultValue={initial?.itemCode ?? ""}
              maxLength={40}
            />
          </Field>
        </div>
        <NameFields initial={initial} descriptions error={error} />
        <fieldset className="space-y-3">
          <legend className="mb-3 font-medium">{m.allergens}</legend>
          <AllergenChecks
            menu={menu}
            codes={codes}
            change={(next) => {
              setCodes(next);
              setReviewed(false);
            }}
          />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-warning/60 bg-warning/12 p-3 text-sm font-medium">
            <Checkbox
              className="mt-0.5"
              checked={reviewed}
              onCheckedChange={(checked) => setReviewed(checked)}
            />
            {m.review}
          </label>
          <FieldDescription>{m.reviewHint}</FieldDescription>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-1 font-medium">{m.optionGroupsField}</legend>
          <FieldDescription>
            {menu.optionGroups.length ? m.optionGroupsHint : m.noGroupsForItem}
          </FieldDescription>
          <div className="grid gap-2 sm:grid-cols-2">
            {menu.optionGroups.map((group) => (
              <label
                key={group.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={groupIds.includes(group.id)}
                  onCheckedChange={(checked) =>
                    setGroupIds(
                      checked ? [...groupIds, group.id] : groupIds.filter((id) => id !== group.id),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium wrap-break-word">
                    {displayName(group, menu.defaultLanguage, language).text}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {m.rule(group.minSelect, group.maxSelect)} ·{" "}
                    {optionPreview(group, menu, language)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Errors error={error} />
        {validation && <FieldError>{validation}</FieldError>}
        {feedback}
        <Actions busy={busy} cancel={cancel} />
      </FieldSet>
    </form>
  );
}
