import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Receipt, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { MasterDetail } from "@/components/master-detail";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { floorQuery } from "@/features/dining/api";
import { formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActiveBillPanel } from "./BillViews";
import { useLiveView } from "@/lib/useLiveView";

export function OwnerOnlyNotice() {
  return (
    <Notice
      tone="warning"
      action={
        <Link to="/staff/floor" className={buttonVariants({ variant: "outline" })}>
          返回桌台
        </Link>
      }
    >
      此页面仅老板可访问。
    </Notice>
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
  const selected = active.find((t) => t.session!.id === sessionId);
  return (
    <div>
      <PageHeader
        title="结账"
        description="核对整桌账单，在线下收款后结束本轮用餐。"
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新桌位"
            disabled={!view.active || floor.isFetching}
            onClick={() => void floor.refetch()}
          >
            <RefreshCw className={cn(floor.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {floor.isError && (
        <Notice tone="error" className="mb-5">
          桌位列表暂时无法更新，请恢复连接后刷新。
        </Notice>
      )}
      <MasterDetail
        open={!!sessionId}
        title={selected ? `${selected.tableLabel} 桌` : "本轮账单"}
        onClose={() => select("")}
        detail={
          sessionId && (
            <ActiveBillPanel
              key={`${account.restaurantId}:${account.userId}:${sessionId}`}
              account={account}
              sessionId={sessionId}
            />
          )
        }
      >
        {floor.isPending && <LoadingState label="正在读取活动桌位…" />}
        {floor.data && active.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="当前没有活动用餐"
            description="开桌后，用餐中的桌会出现在这里。"
          />
        )}
        <div className="@container">
          <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
            {active.map((table) => {
              const session = table.session!;
              return (
                <button
                  key={table.id}
                  type="button"
                  aria-pressed={sessionId === session.id}
                  onClick={() => select(session.id)}
                  className={cn(
                    "space-y-2 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                    sessionId === session.id && "ring-2 ring-primary",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-xl font-semibold wrap-break-word">
                      {table.tableLabel} 桌
                    </span>
                    {session.newOrderCount > 0 && (
                      <Badge variant="warning">待处理 {session.newOrderCount}</Badge>
                    )}
                  </span>
                  <span className="block text-2xl font-semibold tabular-nums">
                    {formatMoney(session.totalAmountCents)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    共 {session.orderCount} 笔 · {formatTime(session.openedAt)} 开桌
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </MasterDetail>
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
