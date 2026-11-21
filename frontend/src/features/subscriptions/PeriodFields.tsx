import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, formatMoney, formatCalendarDate, parsePrice } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformSubscriptionMessages } from "./messages";
import { addCalendarMonths, periodTotal, type SubscriptionPeriod } from "./state";

export function PeriodFields({
  prefix,
  monthlyFee,
  startsOn = "",
  today,
  initial,
  allowPaid = true,
  requireReason = false,
}: {
  prefix: string;
  monthlyFee: number | null;
  startsOn?: string;
  today?: string;
  initial?: SubscriptionPeriod;
  allowPaid?: boolean;
  requireReason?: boolean;
}) {
  const language = useStaffLanguage();
  const m = platformSubscriptionMessages[language];
  const [start, setStart] = useState(initial?.startsOn ?? startsOn);
  const [months, setMonths] = useState(String(initial?.months ?? 1));
  const [enteredFee, setEnteredFee] = useState(
    initial ? formatCents(initial.monthlyFeeCents) : null,
  );
  const [paid, setPaid] = useState(!!initial?.paidOn);
  const fee = enteredFee ?? (monthlyFee === null ? "" : formatCents(monthlyFee));
  const end = addCalendarMonths(start, Number(months));
  const amount = periodTotal(parsePrice(fee), Number(months));
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-monthly-fee`}>{m.monthlyFee}</Label>
        <Input
          id={`${prefix}-monthly-fee`}
          name={`${prefix}-monthly-fee`}
          inputMode="decimal"
          required
          value={fee}
          onChange={(event) => setEnteredFee(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-startsOn`}>{m.startsOn}</Label>
        <Input
          id={`${prefix}-startsOn`}
          name={`${prefix}-startsOn`}
          type="date"
          required
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-months`}>{m.months}</Label>
        <Input
          id={`${prefix}-months`}
          name={`${prefix}-months`}
          type="number"
          min={1}
          max={119987}
          step={1}
          required
          value={months}
          onChange={(event) => setMonths(event.target.value)}
        />
      </div>
      <dl
        aria-live="polite"
        className="grid gap-2 rounded-lg bg-muted p-3 text-sm sm:col-span-2 sm:grid-cols-2"
      >
        <div>
          <dt className="text-muted-foreground">{m.endsOn}</dt>
          <dd className="font-medium">{end ? formatCalendarDate(end, language) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{m.amount}</dt>
          <dd className="font-medium">{amount === null ? "—" : formatMoney(amount, language)}</dd>
        </div>
      </dl>
      {allowPaid && (
        <>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <Checkbox name={`${prefix}-paid`} value="on" checked={paid} onCheckedChange={setPaid} />
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
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-reason`}>
          {requireReason ? m.reasonRequired : m.reasonOptional}
        </Label>
        <Textarea
          id={`${prefix}-reason`}
          name={`${prefix}-reason`}
          required={requireReason}
          maxLength={500}
          rows={2}
        />
      </div>
    </>
  );
}
