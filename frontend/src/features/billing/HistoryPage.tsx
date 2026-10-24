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
import { cn, uniqueBy } from "@/lib/utils";
import { historyKey, readHistory } from "./api";
import { closeBadges, closeLabels, historySearch, type HistorySearch } from "./state";
import { HistoricalBill } from "./BillViews";
import { OwnerOnlyNotice } from "./BillingPage";

const label = "space-y-2 text-sm font-medium";

type Props = { search: HistorySearch; navigate: (search: HistorySearch) => void };
function HistoryContent({ account, search, navigate }: Props & { account: CurrentAccount }) {
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
        title="历史账单"
        description="默认查看餐厅当天关闭的用餐。按关桌日期查询，保留原始账单快照。"
        back={{ to: "/staff", label: "首页" }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新历史列表"
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
        <label className={label}>
          <span className="block">关桌起始日期</span>
          <Input
            name="fromDate"
            type="date"
            required
            defaultValue={search.fromDate ?? head?.fromDate ?? ""}
          />
        </label>
        <label className={label}>
          <span className="block">关桌结束日期</span>
          <Input
            name="toDate"
            type="date"
            required
            defaultValue={search.toDate ?? head?.toDate ?? ""}
          />
        </label>
        <label className={label}>
          <span className="block">历史桌号（精确匹配）</span>
          <Input name="tableLabel" maxLength={50} defaultValue={search.tableLabel ?? ""} />
        </label>
        <label className={label}>
          <span className="block">关闭原因</span>
          <NativeSelect
            id="history-close-reason"
            name="closeReason"
            defaultValue={search.closeReason ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">全部</NativeSelectOption>
            {Object.entries(closeLabels).map(([value, text]) => (
              <NativeSelectOption key={value} value={value}>
                {text}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-4">
          <Button type="submit">查询历史账单</Button>
          <Button type="button" variant="outline" onClick={() => navigate({})}>
            回到当天全部账单
          </Button>
        </div>
      </form>
      {query.isError && (
        <Notice tone="error" className="mb-5">
          {errorMessage(query.error, "历史列表暂时无法更新，请重新读取。")}
        </Notice>
      )}
      <MasterDetail
        open={!!search.sessionId}
        title={selected ? `${selected.tableLabel} 桌 · 历史详情` : "历史详情"}
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
        {query.isPending && <LoadingState label="正在读取历史账单…" />}
        {head && (
          <p className="mb-3 text-sm text-muted-foreground">
            {head.fromDate} 至 {head.toDate} · {head.timeZone} · 共 {head.totalCount} 笔用餐 ·
            已显示 {rows.length} 笔
          </p>
        )}
        {head && rows.length === 0 && (
          <EmptyState icon={History} title="该筛选范围内没有已关闭账单。" />
        )}
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
                  <span className="text-lg font-semibold wrap-break-word">{row.tableLabel} 桌</span>
                  <Badge variant={closeBadges[row.closeReason!]}>
                    {closeLabels[row.closeReason!]}
                  </Badge>
                </span>
                <span className="block text-sm text-muted-foreground">
                  关桌：{formatDateTime(row.closedAt!, "zh", head?.timeZone)}
                </span>
              </span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {formatMoney(row.totalAmountCents)}
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
            加载更多历史账单
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
