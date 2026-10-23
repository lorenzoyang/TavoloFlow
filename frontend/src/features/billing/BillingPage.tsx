import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { floorQuery } from "@/features/dining/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ActiveBillPanel } from "./BillViews";
import { useLiveView } from "@/lib/useLiveView";

export function OwnerOnlyNotice() {
  return (
    <Alert>
      <AlertDescription className="space-y-3">
        <p>此页面仅老板可访问。</p>
        <Link
          to="/staff/floor"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          返回开桌工作台
        </Link>
      </AlertDescription>
    </Alert>
  );
}
type Props = { sessionId?: string; select: (id: string) => void };
function BillingContent({ account, sessionId, select }: Props & { account: CurrentAccount }) {
  const view = useLiveView();
  const floor = useQuery({
    ...floorQuery(account),
    enabled: view.active,
    refetchInterval: view.active ? 30_000 : false,
  });
  const active = floor.data?.tables.filter((t) => t.session) ?? [];
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">{account.restaurantName}</p>
        <h1 className="text-2xl font-semibold">结账工作台</h1>
        <p className="text-sm text-muted-foreground">核对整桌账单，在线下收款后结束本轮用餐。</p>
      </header>
      <nav className="flex flex-wrap gap-3">
        <Link
          to="/staff/floor"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          开桌工作台
        </Link>
        <Link
          to="/staff/history"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          历史账单
        </Link>
        <Link to="/staff" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          返回账号
        </Link>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!view.active || floor.isFetching}
          onClick={() => void floor.refetch()}
        >
          刷新桌位
        </Button>
      </nav>
      {floor.isError && (
        <Alert variant="destructive">
          <AlertDescription>桌位列表暂时无法更新，请恢复连接后刷新。</AlertDescription>
        </Alert>
      )}
      {floor.isPending && <p role="status">正在读取活动桌位…</p>}
      {floor.data && active.length === 0 && <p>当前没有活动用餐。</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((table) => (
          <Card key={table.id}>
            <CardContent className="space-y-3 pt-6">
              <h2 className="text-xl font-semibold wrap-break-word">{table.tableLabel} 桌</h2>
              <p className="text-xl tabular-nums">{formatMoney(table.session!.totalAmountCents)}</p>
              <p className="text-sm text-muted-foreground">
                共 {table.session!.orderCount} 笔 · 待处理 {table.session!.newOrderCount} 笔
              </p>
              <p className="text-xs text-muted-foreground">
                开桌：{formatDateTime(table.session!.openedAt)}
              </p>
              <Button
                className="min-h-11"
                variant={sessionId === table.session!.id ? "secondary" : "outline"}
                onClick={() => select(table.session!.id)}
              >
                查看账单 · {table.tableLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {sessionId && (
        <ActiveBillPanel
          key={`${account.restaurantId}:${account.userId}:${sessionId}`}
          account={account}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
export function BillingPage(props: Props) {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.role === "OWNER" ? (
          <BillingContent
            key={`${account.restaurantId}:${account.userId}`}
            account={account}
            {...props}
          />
        ) : (
          <OwnerOnlyNotice />
        )
      }
    </AuthBoundary>
  );
}
