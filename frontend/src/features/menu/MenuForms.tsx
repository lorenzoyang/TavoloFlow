import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { formatCents, parsePrice } from "@/lib/format";
import type { Category, Menu, MenuItem } from "./api";
import type { Names } from "@/lib/language";
import { displayName } from "@/lib/language";
import { languages, messages as m } from "./messages";

type FormProps = {
  busy: boolean;
  error: unknown;
  cancel: () => void;
  save: (body: unknown) => void;
  feedback: ReactNode;
};

function Errors({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || Object.keys(error.errors).length === 0) return null;
  return (
    <FieldError>
      <p>{m.fieldError}</p>
      <ul className="list-inside list-disc">
        {Object.entries(error.errors).map(([field, errors]) => (
          <li key={field}>{errors.join(" ")}</li>
        ))}
      </ul>
    </FieldError>
  );
}

function NameFields({
  initial,
  descriptions = false,
  error,
}: {
  initial?: Names & Partial<MenuItem>;
  descriptions?: boolean;
  error: unknown;
}) {
  const errors = error instanceof ApiError ? error.errors : {};
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {languages.map(({ code, suffix, label }) => (
        <div key={code} className="space-y-3">
          <Field>
            <FieldLabel htmlFor={`name${suffix}`}>
              {label}
              {m.name}
            </FieldLabel>
            <Input
              className="h-11"
              id={`name${suffix}`}
              name={`name${suffix}`}
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
                {label}
                {m.description}
              </FieldLabel>
              <textarea
                className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id={`description${suffix}`}
                name={`description${suffix}`}
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
        </div>
      ))}
    </div>
  );
}

function namesFrom(data: FormData) {
  return Object.fromEntries(
    languages.map(({ suffix }) => [
      `name${suffix}`,
      String(data.get(`name${suffix}`) ?? "").trim() || null,
    ]),
  );
}

function Actions({ busy, cancel }: Pick<FormProps, "busy" | "cancel">) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button className="h-11" type="submit" disabled={busy}>
        {busy ? m.saving : m.save}
      </Button>
      <Button className="h-11" type="button" variant="outline" onClick={cancel} disabled={busy}>
        {m.cancel}
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
      <h2 className="text-lg font-semibold">{initial ? m.editCategory : m.addCategory}</h2>
      <FieldDescription>{m.nameHint}</FieldDescription>
      <FieldSet disabled={busy}>
        <NameFields initial={initial} error={error} />
        <Errors error={error} />
        {validation && <FieldError>{validation}</FieldError>}
        <Actions busy={busy} cancel={cancel} />
      </FieldSet>
      {feedback}
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
  const [codes, setCodes] = useState(initial?.allergenCodes ?? []);
  const [reviewed, setReviewed] = useState(initial?.allergenReviewed ?? false);
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
    });
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <h2 className="text-lg font-semibold">{initial ? m.editItem : m.addItem}</h2>
      <FieldDescription>{m.nameHint}</FieldDescription>
      <FieldSet disabled={busy} className="gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="categoryId">{m.category}</FieldLabel>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={initial?.categoryId ?? categoryId}
              required
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              {menu.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {displayName(category, menu.defaultLanguage, "zh").text}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="itemCode">{m.itemCode}</FieldLabel>
            <Input
              className="h-11"
              id="itemCode"
              name="itemCode"
              defaultValue={initial?.itemCode ?? ""}
              maxLength={40}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="price">{m.price}</FieldLabel>
            <Input
              className="h-11"
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
        </div>
        <NameFields initial={initial} descriptions error={error} />
        <fieldset className="space-y-4">
          <legend className="mb-3 font-medium">{m.allergens}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {menu.allergens.map((option) => (
              <label
                key={option.code}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={codes.includes(option.code)}
                  onChange={(event) => {
                    setCodes(
                      event.target.checked
                        ? [...codes, option.code]
                        : codes.filter((code) => code !== option.code),
                    );
                    setReviewed(false);
                  }}
                />
                <span>
                  {option.label}
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-muted p-3 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            {m.review}
          </label>
          <FieldDescription>{m.reviewHint}</FieldDescription>
        </fieldset>
        <Errors error={error} />
        {validation && <FieldError>{validation}</FieldError>}
        <Actions busy={busy} cancel={cancel} />
      </FieldSet>
      {feedback}
    </form>
  );
}
