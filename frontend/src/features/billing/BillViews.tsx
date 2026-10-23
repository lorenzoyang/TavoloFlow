import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import type { CurrentAccount } from "@/features/accounts/api";
import { displayName } from "@/features/menu/language";
import { money } from "@/features/orders/format";
import { errorMessage } from "@/lib/api";
import { closeLabels, closureKind, confirmationChanged, type Confirmation } from "./state";
import { useBill } from "./useBill";
import { useClosure } from "./useClosure";
import { billTime } from "./format";

const orderLabels = { NEW: "待处理", READY: "已完成", CANCELLED: "已取消 · 不计应收" };

export function BillDetails({ model, timeZone = "Europe/Rome" }: { model: ReturnType<typeof useBill>; timeZone?: string }) {
  const bill = model.head?.summary;
  return <section aria-label="账单明细" className="space-y-4">
    {model.query.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(model.query.error, "账单暂时无法更新，请恢复连接后刷新。")}</AlertDescription></Alert>}
    {!bill && !model.query.isError && <p role="status">正在读取账单…</p>}
    {bill && <>
      <Card><CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold wrap-break-word">{bill.tableLabel} 桌 · 本轮账单</h2>
          <Badge variant="secondary">{bill.closeReason ? closeLabels[bill.closeReason] : "用餐中"}</Badge></div>
        <p className="text-3xl font-semibold tabular-nums">{money(bill.totalAmountCents, "zh")}</p>
        <p className="text-sm text-muted-foreground">{bill.status === "CLOSED" ? "关闭记录金额" : "整桌应收"} · 共 {bill.orderCount} 笔 · 待处理 {bill.newOrderCount} 笔 · 已取消 {bill.cancelledOrderCount} 笔</p>
        <p className="break-all text-xs text-muted-foreground">用餐编号：{bill.sessionId}</p>
        <p className="text-sm text-muted-foreground">开桌：{billTime(bill.openedAt, timeZone)}{bill.closedAt && ` · 关桌：${billTime(bill.closedAt, timeZone)}`}</p>
      </CardContent></Card>
      <p className="text-sm text-muted-foreground">已显示 {model.orders.length} / {bill.orderCount} 笔。应收包含本轮全部未取消订单，与已加载页数无关。</p>
      {model.orders.map(order => <Card key={order.id}><CardContent className="space-y-3 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3"><Badge variant={order.status === "CANCELLED" ? "outline" : "secondary"}>{orderLabels[order.status]}</Badge>
          <span className={order.status === "CANCELLED" ? "text-muted-foreground line-through" : "font-semibold"}>{money(order.totalAmountCents, "zh")}</span></header>
        <p className="break-all text-xs text-muted-foreground">订单 #{order.id}</p>
        <p className="text-sm text-muted-foreground">下单：{billTime(order.createdAt, timeZone)}</p>
        <ul className="divide-y divide-border">{order.items.map(item => {
          const name = displayName(item, order.defaultLanguage, "zh");
          return <li key={item.id} className="space-y-1 py-3"><div className="flex items-start justify-between gap-3">
            <p lang={name.language} className="min-w-0 wrap-break-word">{item.itemCode && <span className="mr-2 text-muted-foreground">{item.itemCode}</span>}{name.text} × {item.quantity}</p>
            <p className="shrink-0 tabular-nums">{money(item.unitPriceCents * item.quantity, "zh")}</p></div>
            <p className="text-xs text-muted-foreground">单价 {money(item.unitPriceCents, "zh")}</p>
            {item.remark && <p className="text-sm whitespace-pre-wrap wrap-break-word">备注：{item.remark}</p>}</li>;
        })}</ul>
        {order.orderNote && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap wrap-break-word">整单备注：{order.orderNote}</p>}
        {order.readyAt && <p className="text-sm text-muted-foreground">完成：{billTime(order.readyAt, timeZone)}</p>}
        {order.cancelledAt && <div className="space-y-1 text-sm"><p className="text-muted-foreground">取消：{billTime(order.cancelledAt, timeZone)}</p><p className="whitespace-pre-wrap wrap-break-word">取消原因：{order.cancelReason}</p></div>}
      </CardContent></Card>)}
      {bill.orderCount === 0 && <p>本轮从未产生订单。</p>}
      {model.query.hasNextPage && <Button variant="outline" className="min-h-11 w-full" disabled={!model.view.active || model.query.isFetching} onClick={() => void model.query.fetchNextPage()}>加载更多账单订单</Button>}
    </>}
  </section>;
}

export function ActiveBillPanel({ account, sessionId }: { account: CurrentAccount; sessionId: string }) {
  const model = useBill(account, sessionId);
  const closure = useClosure(account);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [checked, setChecked] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const bill = model.head?.summary;
  const kind = bill ? closureKind(bill, account.role) : null;
  const changed = !!confirmation && (!bill || confirmationChanged(confirmation, bill));
  const busy = closure.busy.includes(sessionId);
  const locked = busy || closure.pending.some(p => p.sessionId === sessionId);
  const confirmationId = confirmation?.bill.sessionId;
  useEffect(() => {
    if (confirmationId) { panel.current?.scrollIntoView({ block: "center" }); checkbox.current?.focus({ preventScroll: true }); }
  }, [confirmationId]);
  useEffect(() => {
    // Leaving the active view requires a fresh human confirmation when it returns.
    // oxlint-disable-next-line react/set-state-in-effect
    setConfirmation(null); setChecked(false);
  }, [model.view.resumeAfter]);
  async function submit() {
    if (!confirmation || !checked || changed || !model.fresh || locked) return;
    await closure.close(confirmation);
    // An older submission may finish after a visibility change and a new confirmation.
    setConfirmation(current => current === confirmation ? null : current);
  }
  return <section aria-label="本轮结账" className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button className="min-h-11" variant="outline" disabled={!model.view.active || model.query.isFetching} onClick={() => void model.refresh()}>刷新账单</Button>
      <Link to="/staff/kitchen" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>厨房工作台</Link></div>
    {closure.notice && <Alert role="status"><AlertDescription>{closure.notice}</AlertDescription></Alert>}
    {closure.error && <Alert variant="destructive" role="alert"><AlertDescription>{closure.error}
      {closure.conflict && <p className="mt-2">上次提交被拒绝时：应收 {money(closure.conflict.totalAmountCents, "zh")}，待处理 {closure.conflict.newOrderCount} 笔。请核对下方最新账单。</p>}</AlertDescription></Alert>}
    {closure.storageWarning && <Alert><AlertDescription>浏览器无法保存待确认提示，请在当前页面核对结果，刷新前记录本轮用餐编号。</AlertDescription></Alert>}
    {closure.pending.map(action => <Alert key={action.sessionId} role="status"><AlertDescription className="space-y-3">
      <p className="break-all">关闭结果待确认 · 用餐 #{action.sessionId}。系统不会自动重新提交。</p>
      <Button className="min-h-11" variant="outline" disabled={!model.view.active || closure.busy.includes(action.sessionId)} onClick={() => void closure.recover(action)}>核对原用餐状态</Button>
    </AlertDescription></Alert>)}
    {model.session.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(model.session.error)}</AlertDescription></Alert>}
    {model.closed && model.session.data ? <Card><CardContent className="space-y-3 pt-6">
      <h2 className="text-xl font-semibold">{model.session.data.tableLabel} 桌 · 本轮已结束</h2>
      <p>{closeLabels[model.session.data.closeReason as keyof typeof closeLabels]} · 记录金额 {money(model.session.data.totalAmountCents, "zh")}</p>
      <p className="text-sm text-muted-foreground">本轮顾客授权已失效。下一轮用餐须重新开桌。</p>
      {account.role === "OWNER" && <Link to="/staff/history" search={{ sessionId }} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>查看历史账单</Link>}
    </CardContent></Card> : <>
      {!model.fresh && <Alert variant="destructive"><AlertDescription>账单正在同步或已过期，暂不能关闭。恢复连接并成功同步后继续。</AlertDescription></Alert>}
      {bill?.newOrderCount ? <Alert><AlertDescription>仍有 {bill.newOrderCount} 笔待处理订单，请先到厨房完成或按实际情况取消。</AlertDescription></Alert> : null}
      {confirmation && <section ref={panel} aria-label="关桌确认"><Card><CardContent className="space-y-4 pt-6">
        <h2 className="text-xl font-semibold">{confirmation.kind === "PAID" ? "确认线下收款并清桌" : confirmation.kind === "EMPTY" ? "确认关闭空桌" : "确认全部取消后关闭"} · {confirmation.bill.tableLabel} 桌</h2>
        <p className="text-2xl font-semibold">核对金额：{money(confirmation.bill.totalAmountCents, "zh")}</p>
        <p className="text-sm text-muted-foreground">{confirmation.kind === "PAID" ? "请完成线下收款，再确认关闭本轮用餐。" : "此操作不记录收款。请核对订单并确认顾客已离桌。"}</p>
        {changed && <Alert variant="destructive"><AlertDescription>账单已变化，原确认已失效。请返回账单，核对最新金额后重新确认。</AlertDescription></Alert>}
        <label className="flex min-h-11 items-center gap-3"><input ref={checkbox} type="checkbox" className="size-5 accent-primary" checked={checked} disabled={locked || changed} onChange={e => setChecked(e.target.checked)} />
          {confirmation.kind === "PAID" ? "已核对桌号和金额，并完成线下收款" : "已核对零账单，确认顾客已离桌"}</label>
        <div className="flex flex-wrap gap-3"><Button className="min-h-11" disabled={!checked || changed || locked || !model.fresh} onClick={() => void submit()}>{confirmation.kind === "PAID" ? "已线下收款并清桌" : "确认关闭本轮用餐"}</Button>
          <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => { setConfirmation(null); setChecked(false); }}>返回账单</Button></div>
      </CardContent></Card></section>}
      {kind && !confirmation && <Button className="min-h-12" disabled={!model.fresh || locked} onClick={() => { closure.clearFeedback(); setChecked(false); setConfirmation({ kind, bill: { ...bill! } }); }}>
        {kind === "PAID" ? "核对收款并清桌" : kind === "EMPTY" ? "关闭空桌" : "关闭全部取消的零账单"}</Button>}
      {bill && !kind && bill.newOrderCount === 0 && account.role === "STAFF" && bill.totalAmountCents > 0 && <p>本轮仍有应收，请由老板核对收款。</p>}
      <BillDetails model={model} />
    </>}
  </section>;
}

export function HistoricalBill({ account, sessionId, timeZone }: { account: CurrentAccount; sessionId: string; timeZone?: string }) {
  const model = useBill(account, sessionId, true);
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">已关闭账单只读，内容来自本轮用餐和下单快照。</p>
    <Button variant="outline" className="min-h-11" disabled={!model.view.active || model.query.isFetching} onClick={() => void model.refresh()}>刷新历史详情</Button>
    <BillDetails model={model} timeZone={timeZone} /></div>;
}
