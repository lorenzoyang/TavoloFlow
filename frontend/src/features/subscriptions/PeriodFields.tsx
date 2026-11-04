import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformSubscriptionMessages } from "./messages";
import { addCalendarYears, periodTotal, type PeriodInput } from "./state";

export function PeriodFields({
  prefix,
  annualFee,
  startsOn = "",
  today,
  initial,
  allowPaid = true,
}: {
  prefix: string;
  annualFee: number | null;
  startsOn?: string;
  today?: string;
  initial?: PeriodInput;
  allowPaid?: boolean;
}) {
  const m = platformSubscriptionMessages[useStaffLanguage()];
  const [start, setStart] = useState(initial?.startsOn ?? startsOn);
  const [years, setYears] = useState(String(initial?.years ?? 1));
  const [endOverride, setEndOverride] = useState<string | null>(initial?.endsOn ?? null);
  const [amountOverride, setAmountOverride] = useState<string | null>(
    initial ? formatCents(initial.amountCents) : null,
  );
  const [paid, setPaid] = useState(!!initial?.paidOn);
  const defaultEnd = addCalendarYears(start, Number(years)) ?? "";
  const defaultAmount = periodTotal(annualFee, Number(years));
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-startsOn`}>{m.startsOn}</Label>
        <Input
          id={`${prefix}-startsOn`}
          name={`${prefix}-startsOn`}
          type="date"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-years`}>{m.years}</Label>
        <Input
          id={`${prefix}-years`}
          name={`${prefix}-years`}
          type="number"
          min={1}
          max={9998}
          step={1}
          required
          value={years}
          onChange={(e) => setYears(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-endsOn`}>{m.endsOn}</Label>
        <Input
          id={`${prefix}-endsOn`}
          name={`${prefix}-endsOn`}
          type="date"
          required
          min={start || undefined}
          value={endOverride ?? defaultEnd}
          onChange={(e) => setEndOverride(e.target.value)}
        />
        {endOverride !== null && (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => setEndOverride(null)}
          >
            {m.recomputeEnd}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-amount`}>{m.amount}</Label>
        <Input
          id={`${prefix}-amount`}
          name={`${prefix}-amount`}
          inputMode="decimal"
          required
          value={amountOverride ?? (defaultAmount === null ? "" : formatCents(defaultAmount))}
          onChange={(e) => setAmountOverride(e.target.value)}
        />
        {amountOverride !== null && annualFee !== null && (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => setAmountOverride(null)}
          >
            {m.recomputeAmount}
          </Button>
        )}
      </div>
      {allowPaid && (
        <>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            {/* value="on" keeps the native checkbox form value that periodFromForm reads. */}
            <Checkbox
              name={`${prefix}-paid`}
              value="on"
              checked={paid}
              onCheckedChange={(checked) => setPaid(checked)}
            />
            {m.paidFull}
          </label>
          {paid && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${prefix}-paidOn`}>{m.paidOn}</Label>
              <Input
                id={`${prefix}-paidOn`}
                name={`${prefix}-paidOn`}
                type="date"
                required
                defaultValue={initial?.paidOn ?? today ?? ""}
                max={today}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
