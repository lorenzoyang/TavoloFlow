import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { SubscriptionStatus } from "./SubscriptionViews";

function OwnerReminder({ account }: { account: CurrentAccount }) {
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  if (!detail.data)
    return detail.isError ? (
      <p role="status" className="mb-4">
        年费提醒暂时无法更新。
      </p>
    ) : null;
  const summary = detail.data.summary;
  if (!summary.unpaidPeriodCount && !summary.dueSoon && summary.serviceState !== "EXPIRED")
    return null;
  return (
    <aside aria-label="年费提醒" className="mb-5 space-y-3 rounded-xl border bg-card p-4">
      <SubscriptionStatus summary={summary} />
      {detail.stale && <p className="text-sm text-muted-foreground">提醒待刷新。</p>}
      <Link
        to="/staff/subscription"
        className={buttonVariants({ variant: "outline", className: "min-h-11" })}
      >
        查看年费与收费周期
      </Link>
    </aside>
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
  return (
    <aside aria-label="平台年费提醒" className="space-y-2 rounded-lg border bg-card p-4">
      {reminders.data ? (
        <p>
          年费提醒：已开始待收款 {reminders.data.unpaidCount} 家 · 7 天内到期{" "}
          {reminders.data.dueSoonCount} 家 · 已到期 {reminders.data.expiredCount} 家
        </p>
      ) : (
        <p role="status">{reminders.isError ? "年费提醒暂时无法更新。" : "正在读取年费提醒…"}</p>
      )}
      {reminders.data && reminders.stale && (
        <p className="text-sm text-muted-foreground">提醒待刷新，以上为上次读取结果。</p>
      )}
    </aside>
  );
}
