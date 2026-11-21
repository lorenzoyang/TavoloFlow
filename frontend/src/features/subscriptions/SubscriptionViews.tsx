import { Badge } from "@/components/ui/badge";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { subscriptionMessages } from "./messages";
import type { SubscriptionPeriod, SubscriptionSummary } from "./state";

const stateBadges = {
  UNCONFIGURED: "outline",
  UPCOMING: "secondary",
  ACTIVE: "success",
  EXPIRED: "destructive",
} as const;

// Shared by the OWNER page and the platform pages, which use the same device language.
export function SubscriptionStatus({ summary }: { summary: SubscriptionSummary }) {
  const language = useStaffLanguage();
  const m = subscriptionMessages[language];
  const date = (value: string) => formatCalendarDate(value, language);
  const periodLabel = m.period(summary.serviceState);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Badge variant={stateBadges[summary.serviceState]}>{m.state[summary.serviceState]}</Badge>
        {summary.paymentState && (
          <Badge variant={summary.paymentState === "PAID" ? "success" : "warning"}>
            {m.payment(periodLabel, summary.paymentState === "PAID")}
          </Badge>
        )}
      </div>
      {summary.startsOn && (
        <p className="text-sm leading-6">
          {m.dates(
            periodLabel,
            date(summary.startsOn),
            summary.expiresOn ? date(summary.expiresOn) : null,
          )}
        </p>
      )}
      {summary.paymentState && <p className="text-xs text-muted-foreground">{m.paymentHint}</p>}
      {summary.unpaidPeriodCount > 0 && (
        <p role="status" className="text-sm font-medium text-destructive">
          {m.unpaid(summary.unpaidPeriodCount)}
        </p>
      )}
      {summary.renewal && (
        <p role="status" className="text-sm font-medium">
          {summary.renewal.awaitingPayment
            ? m.awaitingPayment
            : summary.dueSoon
              ? m.dueSoon
              : m.expired}
        </p>
      )}
    </div>
  );
}

export function PeriodDetails({ period }: { period: SubscriptionPeriod }) {
  const language = useStaffLanguage();
  const m = subscriptionMessages[language];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {m.range(
            formatCalendarDate(period.startsOn, language),
            formatCalendarDate(period.endsOn, language),
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {m.amount(
            period.months,
            formatMoney(period.monthlyFeeCents, language),
            formatMoney(period.amountCents, language),
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {m.paidOn(period.paidOn ? formatCalendarDate(period.paidOn, language) : null)}
        </p>
      </div>
      <Badge variant={period.paidOn ? "success" : "warning"}>
        {period.paidOn ? m.paid : m.unpaidBadge}
      </Badge>
    </div>
  );
}
