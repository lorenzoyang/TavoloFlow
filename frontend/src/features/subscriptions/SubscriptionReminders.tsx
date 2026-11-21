import { Link } from "@tanstack/react-router";
import { Notice } from "@/components/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { getReminders, subscriptionRemindersKey } from "./api";
import { platformSubscriptionMessages } from "./messages";
import { useSubscriptionQuery } from "./queries";

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
      <span>{m.remindersTitle}</span>
      {reminders.stale && <span className="block text-xs">{m.remindersStale}</span>}
    </Notice>
  );
}
