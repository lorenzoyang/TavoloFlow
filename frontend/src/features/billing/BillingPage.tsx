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
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { ActiveBillPanel } from "./BillViews";
import { billingMessages } from "./messages";
import { useLiveView } from "@/lib/useLiveView";

export function OwnerOnlyNotice() {
  const m = billingMessages[useStaffLanguage()];
  return (
    <Notice
      tone="warning"
      action={
        <Link to="/staff/floor" className={buttonVariants({ variant: "outline" })}>
          {m.toFloor}
        </Link>
      }
    >
      {m.ownerOnly}
    </Notice>
  );
}
type Props = { sessionId?: string; select: (id: string) => void };
function BillingContent({ account, sessionId, select }: Props & { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const c = staffMessages[language];
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
        title={m.title}
        description={m.description}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refreshTables}
            disabled={!view.active || floor.isFetching}
            onClick={() => void floor.refetch()}
          >
            <RefreshCw className={cn(floor.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {floor.isError && (
        <Notice tone="error" className="mb-5">
          {m.tablesError}
        </Notice>
      )}
      <MasterDetail
        open={!!sessionId}
        title={selected ? c.table(selected.tableLabel) : m.bill}
        closeLabel={c.close}
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
        {floor.isPending && <LoadingState label={m.loadingTables} />}
        {floor.data && active.length === 0 && (
          <EmptyState icon={Receipt} title={m.noVisits} description={m.noVisitsHint} />
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
                      {c.table(table.tableLabel)}
                    </span>
                    {session.newItemCount > 0 && (
                      <Badge variant="warning">{m.pendingBadge(session.newItemCount)}</Badge>
                    )}
                  </span>
                  <span className="block text-2xl font-semibold tabular-nums">
                    {formatMoney(session.totalAmountCents, language)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {m.tableSummary(session.orderCount, formatTime(session.openedAt, language))}
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
