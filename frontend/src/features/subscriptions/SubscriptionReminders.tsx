import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Notice } from "@/components/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { accountQuery } from "@/features/accounts/queries";
import type { CurrentAccount } from "@/features/accounts/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  getOwnerSubscription,
  getReminders,
  ownerSubscriptionKey,
  subscriptionRemindersKey,
} from "./api";
import { subscriptionMessages } from "./messages";
import { useSubscriptionQuery } from "./queries";

// One compact line above every owner page; the details live on /staff/subscription.
function OwnerReminder({ account }: { account: CurrentAccount }) {
  const m = subscriptionMessages[useStaffLanguage()];
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  if (!detail.data)
    return detail.isError ? (
      <p role="status" className="mb-4 text-sm text-muted-foreground">
        {m.reminderError}
      </p>
    ) : null;
  const summary = detail.data.summary;
  const reminders = [
    summary.serviceState === "EXPIRED" && m.expired,
    summary.unpaidPeriodCount > 0 && m.unpaid(summary.unpaidPeriodCount),
    summary.dueSoon && m.dueSoon,
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
          {m.viewSubscription}
        </Link>
      }
    >
      {reminders.join(" ")}
      {detail.stale && m.reminderStale}
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
