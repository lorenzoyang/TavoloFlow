import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { StaffLanguage } from "@/lib/staff-language";
import { subscriptionMessages } from "./messages";
import type { SubscriptionPeriod, SubscriptionSummary } from "./state";

const stateBadges = {
  UNCONFIGURED: "outline",
  UPCOMING: "secondary",
  ACTIVE: "success",
  EXPIRED: "destructive",
} as const;

// Shared by the OWNER page (in the staff language) and the platform pages (in Chinese).
export function SubscriptionStatus({
  summary,
  language,
}: {
  summary: SubscriptionSummary;
  language: StaffLanguage;
}) {
  const m = subscriptionMessages[language];
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
          {m.dates(periodLabel, summary.startsOn, summary.expiresOn)}
        </p>
      )}
      {summary.paymentState && <p className="text-xs text-muted-foreground">{m.paymentHint}</p>}
      {summary.unpaidPeriodCount > 0 && (
        <p role="status" className="text-sm font-medium text-destructive">
          {m.unpaid(summary.unpaidPeriodCount)}
        </p>
      )}
      {summary.dueSoon && (
        <p role="status" className="text-sm font-medium">
          {m.dueSoon}
        </p>
      )}
      {summary.serviceState === "EXPIRED" && (
        <p role="status" className="text-sm font-medium text-destructive">
          {m.expired}
        </p>
      )}
    </div>
  );
}

export function PeriodDetails({
  period,
  language,
}: {
  period: SubscriptionPeriod;
  language: StaffLanguage;
}) {
  const m = subscriptionMessages[language];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="font-medium">{m.range(period.startsOn, period.endsOn)}</p>
        <p className="text-sm text-muted-foreground">
          {m.amount(period.years, formatMoney(period.amountCents, language))}
        </p>
        <p className="text-sm text-muted-foreground">{m.paidOn(period.paidOn)}</p>
      </div>
      <Badge variant={period.paidOn ? "success" : "warning"}>
        {period.paidOn ? m.paid : m.unpaidBadge}
      </Badge>
    </div>
  );
}
