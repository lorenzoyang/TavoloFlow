import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { MasterDetail } from "@/components/master-detail";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { staffMessages, visitTitle } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn, uniqueBy } from "@/lib/utils";
import { historyKey, readHistory } from "./api";
import { billingMessages } from "./messages";
import { closeBadges, historySearch, type HistorySearch } from "./state";
import { HistoricalBill } from "./BillViews";
import { OwnerOnlyNotice } from "./BillingPage";

const label = "space-y-2 text-sm font-medium";
// A native date input needs about 160px for the date and its calendar button, more than half a
// phone-width card, so on phones each date takes its own row.
const dateLabel = `${label} col-span-2 sm:col-span-1`;

type Props = { search: HistorySearch; navigate: (search: HistorySearch) => void };
function HistoryContent({ account, search, navigate }: Props & { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const c = staffMessages[language];
  const filters = useMemo(
    () => ({
      fromDate: search.fromDate,
      toDate: search.toDate,
      tableLabel: search.tableLabel,
      closeReason: search.closeReason,
    }),
    [search.fromDate, search.toDate, search.tableLabel, search.closeReason],
  );
  const query = useInfiniteQuery({
    queryKey: [...historyKey(account), filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readHistory(filters, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const head = query.data?.pages[0];
  const rows = uniqueBy(
    (query.data?.pages ?? []).flatMap((p) => p.items),
    (s) => s.sessionId,
  );
  const selected = rows.find((row) => row.sessionId === search.sessionId);
  return (
    <div>
      <PageHeader
        title={m.historyTitle}
        description={m.historyDescription}
        back={{ to: "/staff", label: c.home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refreshHistory}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <form
        key={JSON.stringify(filters) + (head?.fromDate ?? "") + (head?.toDate ?? "")}
        className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 shadow-xs lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget));
          navigate(historySearch(data));
        }}
      >
        <label className={dateLabel}>
          <span className="block">{m.fromDate}</span>
          <Input
            name="fromDate"
            type="date"
            required
            defaultValue={search.fromDate ?? head?.fromDate ?? ""}
          />
        </label>
        <label className={dateLabel}>
          <span className="block">{m.toDate}</span>
          <Input
            name="toDate"
            type="date"
            required
            defaultValue={search.toDate ?? head?.toDate ?? ""}
          />
        </label>
        <label className={label}>
          <span className="block">{m.tableLabel}</span>
          <Input name="tableLabel" maxLength={50} defaultValue={search.tableLabel ?? ""} />
        </label>
        <label className={label}>
          <span className="block">{m.closeReason}</span>
          <NativeSelect
            id="history-close-reason"
            name="closeReason"
            defaultValue={search.closeReason ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">{m.all}</NativeSelectOption>
            {Object.entries(m.close).map(([value, text]) => (
              <NativeSelectOption key={value} value={value}>
                {text}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-4">
          <Button type="submit">{m.search}</Button>
          <Button type="button" variant="outline" onClick={() => navigate({})}>
            {m.today}
          </Button>
        </div>
      </form>
      {query.isError && (
        <Notice tone="error" className="mb-5">
          {errorMessage(query.error, m.historyError, language)}
        </Notice>
      )}
      <MasterDetail
        open={!!search.sessionId}
        title={selected ? m.historyDetailOf(visitTitle(selected, language)) : m.historyDetail}
        closeLabel={c.close}
        onClose={() => navigate(filters)}
        detail={
          search.sessionId && (
            <HistoricalBill
              key={`${account.userId}:${search.sessionId}`}
              account={account}
              sessionId={search.sessionId}
              timeZone={head?.timeZone}
            />
          )
        }
      >
        {query.isPending && <LoadingState label={m.loadingHistory} />}
        {head && (
          <p className="mb-3 text-sm text-muted-foreground">
            {m.historySummary(
              head.fromDate,
              head.toDate,
              head.timeZone,
              head.totalCount,
              rows.length,
            )}
          </p>
        )}
        {head && rows.length === 0 && <EmptyState icon={History} title={m.noHistory} />}
        <div className="space-y-3">
          {rows.map((row) => (
            <button
              key={row.sessionId}
              type="button"
              aria-pressed={row.sessionId === search.sessionId}
              onClick={() =>
                navigate({
                  ...filters,
                  fromDate: head!.fromDate,
                  toDate: head!.toDate,
                  sessionId: row.sessionId,
                })
              }
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                row.sessionId === search.sessionId && "ring-2 ring-primary",
              )}
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold wrap-break-word">
                    {visitTitle(row, language)}
                  </span>
                  <Badge variant={closeBadges[row.closeReason!]}>{m.close[row.closeReason!]}</Badge>
                </span>
                <span className="block text-sm text-muted-foreground">
                  {m.closedAt(formatDateTime(row.closedAt!, language, head?.timeZone))}
                </span>
              </span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {formatMoney(row.totalAmountCents, language)}
              </span>
            </button>
          ))}
        </div>
        {query.hasNextPage && (
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={query.isFetching}
            onClick={() => void query.fetchNextPage()}
          >
            {m.loadMoreHistory}
          </Button>
        )}
      </MasterDetail>
    </div>
  );
}
export function HistoryPage(props: Props) {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.role === "OWNER" ? (
          <HistoryContent
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
