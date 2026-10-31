import { useState } from "react";
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
import { FilterChips } from "@/components/filter-chips";
import { formatMoney, formatTime } from "@/lib/format";
import { VisitTitle } from "@/components/visit-title";
import { staffMessages, visitTitle } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { activeSessionsQuery } from "./api";
import { ActiveBillPanel } from "./BillViews";
import { billingMessages } from "./messages";
import type { BillSummary } from "./state";
import { useLiveView } from "@/lib/useLiveView";

// STAFF have no bills; the link leads back to their own workspace.
export function OwnerOnlyNotice({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  return (
    <Notice
      tone="warning"
      action={
        <Link
          to={account.services.dineIn ? "/staff/floor" : "/staff"}
          className={buttonVariants({ variant: "outline" })}
        >
          {account.services.dineIn ? m.toFloor : staffMessages[language].home}
        </Link>
      }
    >
      {m.ownerOnly}
    </Notice>
  );
}
type Props = { sessionId?: string; select: (id: string) => void };
type ChannelFilter = "" | BillSummary["channel"];
function BillingContent({ account, sessionId, select }: Props & { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const c = staffMessages[language];
  const view = useLiveView();
  const visits = useQuery({
    ...activeSessionsQuery(account),
    enabled: view.active,
    refetchInterval: view.active ? 30_000 : false,
  });
  // The channel filter only means something when the restaurant offers both services.
  const [channel, setChannel] = useState<ChannelFilter>("");
  const both = account.services.dineIn && account.services.pickup;
  const active = visits.data?.items ?? [];
  const shown = both && channel ? active.filter((v) => v.channel === channel) : active;
  const selected = active.find((v) => v.sessionId === sessionId);
  return (
    <div>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refreshVisits}
            disabled={!view.active || visits.isFetching}
            onClick={() => void visits.refetch()}
          >
            <RefreshCw className={cn(visits.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {visits.isError && (
        <Notice tone="error" className="mb-5">
          {m.visitsError}
        </Notice>
      )}
      <MasterDetail
        open={!!sessionId}
        title={selected ? visitTitle(selected, language) : m.bill}
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
        {both && (
          <div className="mb-4">
            <FilterChips
              label={m.channelFilter}
              value={channel}
              onChange={(value) => setChannel(value as ChannelFilter)}
              items={[
                { value: "", label: m.channelAll },
                { value: "DINE_IN", label: m.channelDineIn },
                { value: "PICKUP", label: m.channelPickup },
              ]}
            />
          </div>
        )}
        {visits.isPending && <LoadingState label={m.loadingVisits} />}
        {visits.data && shown.length === 0 && (
          <EmptyState icon={Receipt} title={m.noVisits} description={m.noVisitsHint} />
        )}
        <div className="@container">
          <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
            {shown.map((visit) => (
              <button
                key={visit.sessionId}
                type="button"
                aria-pressed={sessionId === visit.sessionId}
                onClick={() => select(visit.sessionId)}
                className={cn(
                  "space-y-2 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                  sessionId === visit.sessionId && "ring-2 ring-primary",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-xl font-semibold wrap-break-word">
                    <VisitTitle visit={visit} language={language} />
                  </span>
                  {visit.newItemCount > 0 && (
                    <Badge variant="warning">{m.pendingBadge(visit.newItemCount)}</Badge>
                  )}
                </span>
                <span className="block text-2xl font-semibold tabular-nums">
                  {formatMoney(visit.totalAmountCents, language)}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {visit.channel === "PICKUP"
                    ? m.pickupSummary(formatTime(visit.openedAt, language))
                    : m.tableSummary(visit.orderCount, formatTime(visit.openedAt, language))}
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
          <OwnerOnlyNotice account={account} />
        )
      }
    </AuthBoundary>
  );
}
