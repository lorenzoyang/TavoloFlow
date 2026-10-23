import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { money } from "@/features/orders/format";
import { errorMessage } from "@/lib/api";
import { historyKey, readHistory } from "./api";
import { closeLabels, historySearch, type HistorySearch } from "./state";
import { HistoricalBill } from "./BillViews";
import { billTime } from "./format";
import { OwnerOnlyNotice } from "./BillingPage";

type Props = { search: HistorySearch; navigate: (search: HistorySearch) => void };
function HistoryContent({ account, search, navigate }: Props & { account: CurrentAccount }) {
  const filters = useMemo(() => ({ fromDate: search.fromDate, toDate: search.toDate, tableLabel: search.tableLabel, closeReason: search.closeReason }),
    [search.fromDate, search.toDate, search.tableLabel, search.closeReason]);
  const query = useInfiniteQuery({ queryKey: [...historyKey(account), filters], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readHistory(filters, pageParam, signal), getNextPageParam: page => page.nextCursor ?? undefined });
  const head = query.data?.pages[0];
  const rows = [...new Map((query.data?.pages ?? []).flatMap(p => p.items).map(s => [s.sessionId, s])).values()];
  return <div className="space-y-6">
    <header className="space-y-2"><p className="text-sm text-muted-foreground">{account.restaurantName}</p><h1 className="text-2xl font-semibold">历史账单</h1>
      <p className="text-sm text-muted-foreground">默认查看餐厅当天关闭的用餐。按关桌日期查询，保留原始账单快照。</p></header>
    <nav className="flex flex-wrap gap-3"><Link to="/staff/orders" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>结账工作台</Link>
      <Link to="/staff" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>返回账号</Link>
      <Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>刷新历史列表</Button></nav>
    <form key={JSON.stringify(filters) + (head?.fromDate ?? "") + (head?.toDate ?? "")} className="grid items-end gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); navigate(historySearch(data)); }}>
      <label className="space-y-2 text-sm"><span>关桌起始日期</span><Input name="fromDate" type="date" required defaultValue={search.fromDate ?? head?.fromDate ?? ""} className="h-11" /></label>
      <label className="space-y-2 text-sm"><span>关桌结束日期</span><Input name="toDate" type="date" required defaultValue={search.toDate ?? head?.toDate ?? ""} className="h-11" /></label>
      <label className="space-y-2 text-sm"><span>历史桌号（精确匹配）</span><Input name="tableLabel" maxLength={50} defaultValue={search.tableLabel ?? ""} className="h-11" /></label>
      <div className="space-y-2 text-sm"><label htmlFor="history-close-reason" className="block">关闭原因</label><select id="history-close-reason" name="closeReason" defaultValue={search.closeReason ?? ""} className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="">全部</option>{Object.entries(closeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Button type="submit" className="h-11">查询历史账单</Button>
    </form>
    <Button variant="outline" className="min-h-11" onClick={() => navigate({})}>回到当天全部账单</Button>
    {query.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(query.error, "历史列表暂时无法更新，请重新读取。")}</AlertDescription></Alert>}
    {query.isPending && <p role="status">正在读取历史账单…</p>}
    {head && <p className="text-sm text-muted-foreground">{head.fromDate} 至 {head.toDate} · {head.timeZone} · 共 {head.totalCount} 笔用餐 · 已显示 {rows.length} 笔</p>}
    {head && rows.length === 0 && <p>该筛选范围内没有已关闭账单。</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <Card key={row.sessionId}><CardContent className="space-y-3 pt-6">
      <h2 className="text-xl font-semibold wrap-break-word">{row.tableLabel} 桌 · {closeLabels[row.closeReason!]}</h2>
      <p className="text-xl tabular-nums">{money(row.totalAmountCents, "zh")}</p>
      <p className="text-xs text-muted-foreground">关桌：{billTime(row.closedAt!, head?.timeZone)}</p>
      <Button variant="outline" className="min-h-11" onClick={() => navigate({ ...filters, fromDate: head!.fromDate, toDate: head!.toDate, sessionId: row.sessionId })}>查看历史详情 · {row.tableLabel}</Button>
    </CardContent></Card>)}</div>
    {query.hasNextPage && <Button variant="outline" className="min-h-11 w-full" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>加载更多历史账单</Button>}
    {search.sessionId && <HistoricalBill key={`${account.userId}:${search.sessionId}`} account={account} sessionId={search.sessionId} timeZone={head?.timeZone} />}
  </div>;
}
export function HistoryPage(props: Props) {
  return <AuthBoundary mode="account">{account => account.role === "OWNER"
    ? <HistoryContent key={`${account.restaurantId}:${account.userId}`} account={account} {...props} /> : <OwnerOnlyNotice />}</AuthBoundary>;
}
