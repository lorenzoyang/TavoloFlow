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
import { SessionName } from "@/components/session-name";
import { formatMoney, formatTime } from "@/lib/format";
import { sessionTitle } from "@/lib/session-label";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { activeSessionsQuery } from "./api";
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
  const view = useLiveView();
  const sessions = useQuery({
    ...activeSessionsQuery(account),
    enabled: view.active,
    refetchInterval: view.active ? 30_000 : false,
  });
  const active = sessions.data?.items ?? [];
  const selected = active.find((bill) => bill.sessionId === sessionId);
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
            disabled={!view.active || sessions.isFetching}
            onClick={() => void sessions.refetch()}
          >
            <RefreshCw className={cn(sessions.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {sessions.isError && (
        <Notice tone="error" className="mb-5">
          {m.tablesError}
        </Notice>
      )}
      <MasterDetail
        open={!!sessionId}
        title={selected ? sessionTitle(selected, language) : m.bill}
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
        {sessions.isPending && <LoadingState label={m.loadingTables} />}
        {sessions.data && active.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={m.noVisits}
            description={m.noVisitsHint(account.services.dineIn, account.services.online)}
          />
        )}
        <div className="@container">
          <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
            {active.map((bill) => (
              <button
                key={bill.sessionId}
                type="button"
                aria-pressed={sessionId === bill.sessionId}
                onClick={() => select(bill.sessionId)}
                className={cn(
                  "min-w-0 space-y-2 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                  sessionId === bill.sessionId && "ring-2 ring-primary",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <SessionName session={bill} className="min-w-0 text-xl font-semibold" />
                  {bill.newItemCount > 0 && (
                    <Badge variant="warning">{m.pendingBadge(bill.newItemCount)}</Badge>
                  )}
                </span>
                <span className="block text-2xl font-semibold tabular-nums">
                  {formatMoney(bill.totalAmountCents, language)}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {bill.online
                    ? m.online.summary(formatTime(bill.openedAt, language))
                    : m.tableSummary(bill.orderCount, formatTime(bill.openedAt, language))}
                </span>
              </button>
            ))}
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
