import { useRef, useState } from "react";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reveal } from "@/features/menu/form-values";
import { formatCents, formatKm, formatMoney, parsePrice } from "@/lib/format";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { onlineMessages } from "./messages";
import {
  applyFreeDeliveryMinimum,
  deliveryTierRanges,
  freeDeliveryChanges,
  type DeliveryTier,
  type TierDraft,
} from "./state";

export type FreeDeliveryEdit = number | "new" | null;

export function FreeDeliverySettings({
  tiers,
  savedTiers,
  editing,
  busy,
  onEdit,
  onApply,
}: {
  tiers: TierDraft[];
  savedTiers?: DeliveryTier[];
  editing: FreeDeliveryEdit;
  busy: boolean;
  onEdit: (edit: FreeDeliveryEdit) => void;
  onApply: (tiers: TierDraft[]) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineMessages[language].freeDelivery;
  const ranges = deliveryTierRanges(tiers);
  const changes = savedTiers && freeDeliveryChanges(tiers, savedTiers);
  const groups = new Map<number, string[]>();
  for (const band of ranges ?? []) {
    const minimum = tiers[band.index].freeDeliveryMinCents;
    if (minimum === null) continue;
    const distances = groups.get(minimum) ?? [];
    groups.set(minimum, [...distances, formatKm(band.maxMeters, language)]);
  }
  return (
    <section className="space-y-2 border-t pt-4" aria-labelledby="free-delivery-title">
      <h3 id="free-delivery-title" className="text-sm font-medium">
        {m.title}
      </h3>
      {groups.size > 0 && (
        <ul className="divide-y border-y">
          {[...groups].map(([amount, bands]) => (
            <li key={amount} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0 space-y-1 py-1">
                <p className="text-sm font-medium wrap-break-word">
                  {m.summary(formatMoney(amount, language))}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 text-sm wrap-break-word text-muted-foreground">
                    {bands.join(m.bandSeparator)}
                    {m.bandSuffix}
                  </p>
                  {changes?.amounts.has(amount) && <Badge variant="outline">{m.unsaved}</Badge>}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || editing !== null}
                aria-label={m.edit(formatMoney(amount, language))}
                onClick={() => onEdit(amount)}
              >
                {m.editAction}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {changes && changes.amounts.size > 0 && (
        <Notice>{changes.restoresBaseFee ? m.removalPending : m.saveHint}</Notice>
      )}
      {editing !== null && ranges ? (
        <ThresholdEditor
          tiers={tiers}
          ranges={ranges}
          original={editing === "new" ? null : editing}
          busy={busy}
          cancel={() => onEdit(null)}
          apply={onApply}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !ranges?.length}
          onClick={() => onEdit("new")}
        >
          {m.add}
        </Button>
      )}
    </section>
  );
}

function ThresholdEditor({
  tiers,
  ranges,
  original,
  busy,
  cancel,
  apply,
}: {
  tiers: TierDraft[];
  ranges: NonNullable<ReturnType<typeof deliveryTierRanges>>;
  original: number | null;
  busy: boolean;
  cancel: () => void;
  apply: (tiers: TierDraft[]) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineMessages[language].freeDelivery;
  const [amount, setAmount] = useState(original === null ? "" : formatCents(original));
  const [selected, setSelected] = useState<number[]>(() =>
    original === null
      ? []
      : ranges.flatMap(({ index }) =>
          tiers[index].freeDeliveryMinCents === original ? [index] : [],
        ),
  );
  const [problem, setProblem] = useState<"amount" | "bands" | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const allRef = useRef<HTMLButtonElement>(null);
  const removing = selected.length === 0 && original !== null;

  function removeGroup() {
    apply(applyFreeDeliveryMinimum(tiers, original, [], null));
  }

  function submit() {
    if (removing) {
      removeGroup();
      return;
    }
    const minimum = parsePrice(amount);
    if (minimum === null) {
      setProblem("amount");
      reveal(amountRef.current);
      return;
    }
    if (selected.length === 0) {
      setProblem("bands");
      reveal(allRef.current);
      return;
    }
    apply(applyFreeDeliveryMinimum(tiers, original, selected, minimum));
  }

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="space-y-2">
        <Label htmlFor="free-delivery-minimum">{m.minimum}</Label>
        <Input
          id="free-delivery-minimum"
          ref={amountRef}
          className="max-w-40"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          disabled={busy}
          aria-invalid={problem === "amount"}
          aria-describedby="free-delivery-subtotal"
          onChange={(event) => {
            setAmount(event.target.value);
            setProblem(null);
          }}
        />
        <p id="free-delivery-subtotal" className="text-sm text-muted-foreground">
          {m.hint}
        </p>
      </div>
      <fieldset disabled={busy}>
        <legend className="text-sm font-medium">{m.bands}</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox
            ref={allRef}
            checked={selected.length === ranges.length}
            indeterminate={selected.length > 0 && selected.length < ranges.length}
            onCheckedChange={(checked) => {
              setSelected(checked ? ranges.map(({ index }) => index) : []);
              setProblem(null);
            }}
          />
          {m.all}
        </label>
        <ul className="divide-y border-y">
          {ranges.map(({ index, minMeters, maxMeters }) => {
            const current = tiers[index].freeDeliveryMinCents;
            const checked = selected.includes(index);
            const max = formatKm(maxMeters, language);
            return (
              <li key={index}>
                <label className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      setSelected((previous) =>
                        next ? [...previous, index] : previous.filter((item) => item !== index),
                      );
                      setProblem(null);
                    }}
                  />
                  <span className="min-w-0">
                    {minMeters === 0 ? m.within(max) : m.range(formatKm(minMeters, language), max)}
                    {current !== null && current !== original && (
                      <span className="block text-muted-foreground">
                        {(checked ? m.replace : m.current)(formatMoney(current, language))}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {problem && (
        <Notice tone="error">{problem === "amount" ? m.amountProblem : m.bandsProblem}</Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={submit}>
          {m.done}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
          {staffMessages[language].cancel}
        </Button>
        {original !== null && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={removeGroup}
          >
            {m.remove}
          </Button>
        )}
      </div>
    </div>
  );
}
