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
import { platformSubscriptionMessages, subscriptionMessages } from "./messages";
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
// Only the counts that need attention, each a link to the list filtered to those restaurants.
export function PlatformSubscriptionReminders({ userId }: { userId: string }) {
  const m = platformSubscriptionMessages[useStaffLanguage()];
  const reminders = useSubscriptionQuery(subscriptionRemindersKey(userId), getReminders);
  if (!reminders.data)
    return reminders.isError ? (
      <p role="status" className="mb-4 text-sm text-muted-foreground">
        {m.reminderError}
      </p>
    ) : null;
  const { unpaidCount, dueSoonCount, expiredCount } = reminders.data;
  const counts = (
    [
      ["UNPAID", unpaidCount],
      ["DUE_SOON", dueSoonCount],
      ["EXPIRED", expiredCount],
    ] as const
  ).filter(([, count]) => count > 0);
  if (!counts.length) return null;
  return (
    <Notice
      tone="warning"
      className="mb-4"
      action={counts.map(([kind, count]) => (
        <Link
          key={kind}
          to="/platform/restaurants"
          search={{ subscriptionStatus: kind }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {m.reminder(kind, count)}
        </Link>
      ))}
    >
      {m.remindersTitle}
      {reminders.stale && <span className="block text-xs">{m.remindersStale}</span>}
    </Notice>
  );
}
