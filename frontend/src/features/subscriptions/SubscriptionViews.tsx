import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { subscriptionStateLabel, type SubscriptionPeriod, type SubscriptionSummary } from "./state";

const stateBadges = {
  UNCONFIGURED: "outline",
  UPCOMING: "secondary",
  ACTIVE: "success",
  EXPIRED: "destructive",
} as const;

export function SubscriptionStatus({ summary }: { summary: SubscriptionSummary }) {
  const periodLabel =
    summary.serviceState === "UPCOMING"
      ? "待开始周期"
      : summary.serviceState === "EXPIRED"
        ? "最近周期"
        : "当前周期";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Badge variant={stateBadges[summary.serviceState]}>
          {subscriptionStateLabel(summary.serviceState)}
        </Badge>
        {summary.paymentState && (
          <Badge variant={summary.paymentState === "PAID" ? "success" : "warning"}>
            {periodLabel}
            {summary.paymentState === "PAID" ? "已付费" : "未付费"}
          </Badge>
        )}
      </div>
      {summary.startsOn && (
        <p className="text-sm leading-6">
          {periodLabel}开始日期 {summary.startsOn} · 连续约定服务截止日期 {summary.expiresOn}
          （当天到期）
        </p>
      )}
      {summary.paymentState && (
        <p className="text-xs text-muted-foreground">各周期的付款情况请查看收费周期明细。</p>
      )}
      {summary.unpaidPeriodCount > 0 && (
        <p role="status" className="text-sm font-medium text-destructive">
          有 {summary.unpaidPeriodCount} 个已开始的周期待付费。
        </p>
      )}
      {summary.dueSoon && (
        <p role="status" className="text-sm font-medium">
          服务将在 7 天内到期，请安排续费。
        </p>
      )}
      {summary.serviceState === "EXPIRED" && (
        <p role="status" className="text-sm font-medium text-destructive">
          约定服务期限已到期，请安排续费。
        </p>
      )}
    </div>
  );
}

export function PeriodDetails({ period }: { period: SubscriptionPeriod }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="font-medium">
          {period.startsOn} 至 {period.endsOn}（截止当天到期）
        </p>
        <p className="text-sm text-muted-foreground">
          {period.years} 年 · 总金额 {formatMoney(period.amountCents)}
        </p>
        <p className="text-sm text-muted-foreground">
          {period.paidOn ? `付费日期 ${period.paidOn}` : "付费日期尚未登记"}
        </p>
      </div>
      <Badge variant={period.paidOn ? "success" : "warning"}>
        {period.paidOn ? "已付费" : "未付费"}
      </Badge>
    </div>
  );
}
