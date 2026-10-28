import { CalendarClock, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { getOwnerSubscription, ownerSubscriptionKey } from "./api";
import { subscriptionMessages } from "./messages";
import { useSubscriptionQuery } from "./queries";
import { PeriodDetails, SubscriptionStatus } from "./SubscriptionViews";

// Read-only: the platform administrator maintains the subscription.
function OwnerSubscription({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = subscriptionMessages[language];
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  const summary = detail.data?.summary;
  const periods = detail.data?.periods;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={m.title}
        description={account.restaurantName}
        back={{ to: "/staff", label: staffMessages[language].home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
            onClick={() => void detail.refetch()}
          >
            <RefreshCw className={cn(detail.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-5">
        {detail.isPending && <LoadingState label={m.loading} />}
        {detail.error && (
          <Notice tone="error">{errorMessage(detail.error, undefined, language)}</Notice>
        )}
        {summary && (
          <Card>
            <CardContent className="space-y-4">
              <SubscriptionStatus summary={summary} language={language} />
              <dl className="grid gap-x-4 gap-y-2 border-t pt-4 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">{m.defaultFee}</dt>
                <dd className="font-medium">
                  {summary.defaultAnnualFeeCents === null
                    ? m.notSet
                    : formatMoney(summary.defaultAnnualFeeCents, language)}
                </dd>
                <dt className="text-muted-foreground">{m.contact}</dt>
                <dd className="font-medium whitespace-pre-wrap wrap-break-word">
                  {summary.ownerContact || m.notRegistered}
                </dd>
              </dl>
              <p className="text-sm text-muted-foreground">{m.collectedOffline}</p>
              {detail.stale && (
                <p role="status" className="text-sm">
                  {m.stale}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <h2 className="text-lg font-semibold">{m.periods}</h2>
        {periods?.length === 0 && <EmptyState icon={CalendarClock} title={m.noPeriods} />}
        {periods?.map((period) => (
          <article key={period.id} className="rounded-2xl border bg-card p-4 shadow-xs">
            <PeriodDetails period={period} language={language} />
          </article>
        ))}
      </div>
    </div>
  );
}
export function OwnerSubscriptionPage() {
  const m = subscriptionMessages[useStaffLanguage()];
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.role === "OWNER" ? (
          <OwnerSubscription key={`${account.restaurantId}:${account.userId}`} account={account} />
        ) : (
          <Notice tone="warning">{m.ownerOnly}</Notice>
        )
      }
    </AuthBoundary>
  );
}
