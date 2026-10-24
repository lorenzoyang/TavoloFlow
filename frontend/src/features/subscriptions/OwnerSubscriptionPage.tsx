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
import { cn } from "@/lib/utils";
import { getOwnerSubscription, ownerSubscriptionKey } from "./api";
import { useSubscriptionQuery } from "./queries";
import { PeriodDetails, SubscriptionStatus } from "./SubscriptionViews";

// Read-only: the platform administrator maintains the subscription.
function OwnerSubscription({ account }: { account: CurrentAccount }) {
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  const summary = detail.data?.summary;
  const periods = detail.data?.periods;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="年费与收费周期"
        description={account.restaurantName}
        back={{ to: "/staff", label: "首页" }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新资料"
            onClick={() => void detail.refetch()}
          >
            <RefreshCw className={cn(detail.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-5">
        {detail.isPending && <LoadingState label="正在读取年费资料…" />}
        {detail.error && <Notice tone="error">{errorMessage(detail.error)}</Notice>}
        {summary && (
          <Card>
            <CardContent className="space-y-4">
              <SubscriptionStatus summary={summary} />
              <dl className="grid gap-x-4 gap-y-2 border-t pt-4 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">下次新建周期的默认年费</dt>
                <dd className="font-medium">
                  {summary.defaultAnnualFeeCents === null
                    ? "尚未设置"
                    : formatMoney(summary.defaultAnnualFeeCents)}
                </dd>
                <dt className="text-muted-foreground">登记的老板联系方式</dt>
                <dd className="font-medium whitespace-pre-wrap wrap-break-word">
                  {summary.ownerContact || "尚未登记"}
                </dd>
              </dl>
              <p className="text-sm text-muted-foreground">
                费用由平台管理员线下收取，收到全款后更新付费日期。服务期限按约定日期计算。
              </p>
              {detail.stale && (
                <p role="status" className="text-sm">
                  资料待刷新，当前显示的是上次读取结果。
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <h2 className="text-lg font-semibold">收费周期与付款历史</h2>
        {periods?.length === 0 && <EmptyState icon={CalendarClock} title="尚未登记收费周期。" />}
        {periods?.map((period) => (
          <article key={period.id} className="rounded-2xl border bg-card p-4 shadow-xs">
            <PeriodDetails period={period} />
          </article>
        ))}
      </div>
    </div>
  );
}
export function OwnerSubscriptionPage() {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.role === "OWNER" ? (
          <OwnerSubscription key={`${account.restaurantId}:${account.userId}`} account={account} />
        ) : (
          <Notice tone="warning">仅老板可以查看年费与收费周期。</Notice>
        )
      }
    </AuthBoundary>
  );
}
