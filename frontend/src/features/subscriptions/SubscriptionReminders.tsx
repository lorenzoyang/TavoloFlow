import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Notice } from "@/components/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { accountQuery } from "@/features/accounts/queries";
import type { CurrentAccount } from "@/features/accounts/api";
import {
  getOwnerSubscription,
  getReminders,
  ownerSubscriptionKey,
  subscriptionRemindersKey,
} from "./api";
import { useSubscriptionQuery } from "./queries";

// One compact line above every owner page; the details live on /staff/subscription.
function OwnerReminder({ account }: { account: CurrentAccount }) {
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  if (!detail.data)
    return detail.isError ? (
      <p role="status" className="mb-4 text-sm text-muted-foreground">
        年费提醒暂时无法更新。
      </p>
    ) : null;
  const summary = detail.data.summary;
  const reminders = [
    summary.serviceState === "EXPIRED" && "约定服务期限已到期，请安排续费。",
    summary.unpaidPeriodCount > 0 && `有 ${summary.unpaidPeriodCount} 个已开始的周期待付费。`,
    summary.dueSoon && "服务将在 7 天内到期，请安排续费。",
  ].filter(Boolean);
  if (!reminders.length) return null;
  return (
    <Notice
      tone="warning"
      className="mb-5"
      action={
        <Link
          to="/staff/subscription"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          查看年费与收费周期
        </Link>
      }
    >
      {reminders.join(" ")}
      {detail.stale && " 提醒待刷新。"}
    </Notice>
  );
}
export function OwnerSubscriptionReminder() {
  const identity = useQuery(accountQuery);
  const account = identity.data;
  return account?.role === "OWNER" && !account.mustChangePassword ? (
    <OwnerReminder key={`${account.restaurantId}:${account.userId}`} account={account} />
  ) : null;
}
export function PlatformSubscriptionReminders({ userId }: { userId: string }) {
  const reminders = useSubscriptionQuery(subscriptionRemindersKey(userId), getReminders);
  if (!reminders.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {reminders.isError ? "年费提醒暂时无法更新。" : "正在读取年费提醒…"}
      </p>
    );
  const { unpaidCount, dueSoonCount, expiredCount } = reminders.data;
  return (
    <Notice tone={unpaidCount || dueSoonCount || expiredCount ? "warning" : "info"}>
      年费提醒：已开始待收款 {unpaidCount} 家 · 7 天内到期 {dueSoonCount} 家 · 已到期 {expiredCount}{" "}
      家{reminders.stale && <span className="block text-xs">提醒待刷新，以上为上次读取结果。</span>}
    </Notice>
  );
}
