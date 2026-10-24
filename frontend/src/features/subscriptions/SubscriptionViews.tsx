import { formatMoney } from "@/lib/format";
import { subscriptionStateLabel, type SubscriptionPeriod, type SubscriptionSummary } from "./state";

export function SubscriptionStatus({ summary }: { summary: SubscriptionSummary }) {
  const periodLabel =
    summary.serviceState === "UPCOMING"
      ? "待开始周期"
      : summary.serviceState === "EXPIRED"
        ? "最近周期"
        : "当前周期";
  return (
    <div className="space-y-2">
      <p>
        {subscriptionStateLabel(summary.serviceState)}
        {summary.paymentState &&
          ` ／ ${periodLabel}${summary.paymentState === "PAID" ? "已付费" : "未付费"}`}
      </p>
      {summary.startsOn && (
        <p>
          {periodLabel}开始日期 {summary.startsOn} · 连续约定服务截止日期 {summary.expiresOn}
          （当天到期）
        </p>
      )}
      {summary.paymentState && (
        <p className="text-sm text-muted-foreground">各周期的付款情况请查看收费周期明细。</p>
      )}
      {summary.unpaidPeriodCount > 0 && (
        <p role="status" className="font-medium text-destructive">
          有 {summary.unpaidPeriodCount} 个已开始的周期待付费。
        </p>
      )}
      {summary.dueSoon && (
        <p role="status" className="font-medium">
          服务将在 7 天内到期，请安排续费。
        </p>
      )}
      {summary.serviceState === "EXPIRED" && (
        <p role="status" className="font-medium text-destructive">
          约定服务期限已到期，请安排续费。
        </p>
      )}
    </div>
  );
}
export function PeriodDetails({ period }: { period: SubscriptionPeriod }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">
        {period.startsOn} 至 {period.endsOn}（截止当天到期）
      </p>
      <p>
        {period.years} 年 · 总金额 {formatMoney(period.amountCents)}
      </p>
      <p>{period.paidOn ? `已付费 · ${period.paidOn}` : "未付费 · 付费日期尚未登记"}</p>
    </div>
  );
}
