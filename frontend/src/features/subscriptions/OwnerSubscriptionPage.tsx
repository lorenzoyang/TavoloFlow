import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { getOwnerSubscription, ownerSubscriptionKey } from "./api";
import { useSubscriptionQuery } from "./queries";
import { PeriodDetails, SubscriptionStatus } from "./SubscriptionViews";

// Read-only: the platform administrator maintains the subscription.
function OwnerSubscription({ account }: { account: CurrentAccount }) {
  const detail = useSubscriptionQuery(ownerSubscriptionKey(account), getOwnerSubscription);
  const summary = detail.data?.summary;
  const periods = detail.data?.periods;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">年费与收费周期 · {account.restaurantName}</h1>
      <div className="flex flex-wrap gap-3">
        <Link to="/staff" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          返回账号页
        </Link>
        <Button className="min-h-11" variant="outline" onClick={() => void detail.refetch()}>
          刷新资料
        </Button>
      </div>
      {detail.isPending && <p role="status">正在读取年费资料…</p>}
      {detail.error && <p role="alert">{errorMessage(detail.error)}</p>}
      {summary && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <SubscriptionStatus summary={summary} />
          <p>
            下次新建周期的默认年费：
            {summary.defaultAnnualFeeCents === null
              ? "尚未设置"
              : formatMoney(summary.defaultAnnualFeeCents)}
          </p>
          <p className="whitespace-pre-wrap wrap-break-word">
            登记的老板联系方式：{summary.ownerContact || "尚未登记"}
          </p>
          <p className="text-sm text-muted-foreground">
            费用由平台管理员线下收取，收到全款后更新付费日期。服务期限按约定日期计算。
          </p>
          {detail.stale && <p role="status">资料待刷新，当前显示的是上次读取结果。</p>}
        </section>
      )}
      <h2 className="text-lg font-semibold">收费周期与付款历史</h2>
      {periods?.length === 0 && <p>尚未登记收费周期。</p>}
      {periods?.map((period) => (
        <article key={period.id} className="rounded-xl border bg-card p-5">
          <PeriodDetails period={period} />
        </article>
      ))}
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
          <p role="alert">仅老板可以查看年费与收费周期。</p>
        )
      }
    </AuthBoundary>
  );
}
