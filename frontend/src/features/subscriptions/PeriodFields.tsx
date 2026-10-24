import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/format";
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
        <Label htmlFor={`${prefix}-startsOn`}>开始收费日期</Label>
        <Input
          id={`${prefix}-startsOn`}
          name={`${prefix}-startsOn`}
          type="date"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-years`}>收费年数</Label>
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
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-endsOn`}>截止日期（当天到期）</Label>
        <Input
          id={`${prefix}-endsOn`}
          name={`${prefix}-endsOn`}
          type="date"
          required
          min={start || undefined}
          value={endOverride ?? defaultEnd}
          onChange={(e) => setEndOverride(e.target.value)}
          className="h-11"
        />
        {endOverride !== null && (
          <button
            type="button"
            className="min-h-11 text-sm underline"
            onClick={() => setEndOverride(null)}
          >
            按开始日期和年数重新计算
          </button>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-amount`}>整个周期总金额（EUR）</Label>
        <Input
          id={`${prefix}-amount`}
          name={`${prefix}-amount`}
          inputMode="decimal"
          required
          value={amountOverride ?? (defaultAmount === null ? "" : formatCents(defaultAmount))}
          onChange={(e) => setAmountOverride(e.target.value)}
          className="h-11"
        />
        {amountOverride !== null && annualFee !== null && (
          <button
            type="button"
            className="min-h-11 text-sm underline"
            onClick={() => setAmountOverride(null)}
          >
            按年费 × 年数重新计算
          </button>
        )}
      </div>
      {allowPaid && (
        <>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name={`${prefix}-paid`}
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="size-5"
            />
            已收到整个周期的全款
          </label>
          {paid && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${prefix}-paidOn`}>实际付费日期</Label>
              <Input
                id={`${prefix}-paidOn`}
                name={`${prefix}-paidOn`}
                type="date"
                required
                defaultValue={initial?.paidOn ?? today ?? ""}
                max={today}
                className="h-11"
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
