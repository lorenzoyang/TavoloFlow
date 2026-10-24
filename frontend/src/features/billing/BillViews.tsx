import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Checkbox } from "@/components/ui/checkbox";
import type { CurrentAccount } from "@/features/accounts/api";
import type { KitchenOrder } from "@/features/kitchen/api";
import { displayName } from "@/lib/language";
import { formatDateTime, formatMoney, shortId } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  closeBadges,
  closeLabels,
  closureKind,
  confirmationChanged,
  type BillSummary,
  type Confirmation,
} from "./state";
import { useBill } from "./useBill";
import { useClosure } from "./useClosure";

const orderLabels = { NEW: "待处理", READY: "已完成", CANCELLED: "已取消 · 不计应收" };
const orderBadges = { NEW: "warning", READY: "success", CANCELLED: "outline" } as const;

function BillOrder({ order, timeZone }: { order: KitchenOrder; timeZone: string }) {
  const cancelled = order.status === "CANCELLED";
  return (
    <article className={cn("space-y-2 rounded-xl border p-3", cancelled && "bg-muted/60")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={orderBadges[order.status]}>{orderLabels[order.status]}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(order.createdAt, "zh", timeZone)} · #{shortId(order.id)}
          </span>
        </div>
        <span
          className={cn(
            "font-semibold tabular-nums",
            cancelled && "font-normal text-muted-foreground line-through",
          )}
        >
          {formatMoney(order.totalAmountCents)}
        </span>
      </header>
      <ul className="divide-y">
        {order.items.map((item) => {
          const name = displayName(item, order.defaultLanguage, "zh");
          return (
            <li key={item.id} className="space-y-0.5 py-2">
              <div className="flex items-start justify-between gap-3">
                <p lang={name.language} className="min-w-0 wrap-break-word">
                  {item.itemCode && (
                    <span className="mr-2 text-muted-foreground">{item.itemCode}</span>
                  )}
                  {item.quantity} × {name.text}
                </p>
                <p className="shrink-0 tabular-nums">
                  {formatMoney(item.unitPriceCents * item.quantity)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                单价 {formatMoney(item.unitPriceCents)}
              </p>
              {item.remark && (
                <p className="text-sm whitespace-pre-wrap wrap-break-word">备注：{item.remark}</p>
              )}
            </li>
          );
        })}
      </ul>
      {order.orderNote && (
        <p className="rounded-lg bg-secondary p-2.5 text-sm whitespace-pre-wrap wrap-break-word">
          整单备注：{order.orderNote}
        </p>
      )}
      {order.readyAt && (
        <p className="text-sm text-muted-foreground">
          完成：{formatDateTime(order.readyAt, "zh", timeZone)}
        </p>
      )}
      {order.cancelledAt && (
        <div className="space-y-0.5 text-sm">
          <p className="text-muted-foreground">
            取消：{formatDateTime(order.cancelledAt, "zh", timeZone)}
          </p>
          <p className="whitespace-pre-wrap wrap-break-word">取消原因：{order.cancelReason}</p>
        </div>
      )}
    </article>
  );
}

function BillTotal({ bill, timeZone }: { bill: BillSummary; timeZone: string }) {
  return (
    <div className="space-y-2 rounded-2xl bg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {bill.status === "CLOSED" ? "关闭记录金额" : "整桌应收"}
        </p>
        <Badge variant={bill.closeReason ? closeBadges[bill.closeReason] : "secondary"}>
          {bill.closeReason ? closeLabels[bill.closeReason] : "用餐中"}
        </Badge>
      </div>
      <p className="text-3xl font-semibold tabular-nums">{formatMoney(bill.totalAmountCents)}</p>
      <p className="text-sm text-muted-foreground">
        共 {bill.orderCount} 笔 · 待处理 {bill.newOrderCount} 笔 · 已取消 {bill.cancelledOrderCount}{" "}
        笔
      </p>
      <p className="text-sm text-muted-foreground">
        开桌：{formatDateTime(bill.openedAt, "zh", timeZone)}
        {bill.closedAt && ` · 关桌：${formatDateTime(bill.closedAt, "zh", timeZone)}`}
      </p>
      <p className="text-xs break-all text-muted-foreground">用餐编号：{bill.sessionId}</p>
    </div>
  );
}

export function BillDetails({
  model,
  timeZone = "Europe/Rome",
}: {
  model: ReturnType<typeof useBill>;
  timeZone?: string;
}) {
  const bill = model.head?.summary;
  return (
    <section aria-label="账单明细" className="space-y-4">
      {model.query.isError && (
        <Notice tone="error">
          {errorMessage(model.query.error, "账单暂时无法更新，请恢复连接后刷新。")}
        </Notice>
      )}
      {!bill && !model.query.isError && <LoadingState label="正在读取账单…" />}
      {bill && (
        <>
          <BillTotal bill={bill} timeZone={timeZone} />
          <p className="text-sm leading-6 text-muted-foreground">
            已显示 {model.orders.length} / {bill.orderCount}{" "}
            笔。应收包含本轮全部未取消订单，与已加载页数无关。
          </p>
          {model.orders.map((order) => (
            <BillOrder key={order.id} order={order} timeZone={timeZone} />
          ))}
          {bill.orderCount === 0 && <p className="text-muted-foreground">本轮从未产生订单。</p>}
          {model.query.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={!model.view.active || model.query.isFetching}
              onClick={() => void model.query.fetchNextPage()}
            >
              加载更多账单订单
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export function ActiveBillPanel({
  account,
  sessionId,
}: {
  account: CurrentAccount;
  sessionId: string;
}) {
  const model = useBill(account, sessionId);
  const closure = useClosure(account);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [checked, setChecked] = useState(false);
  const checkbox = useRef<HTMLElement>(null);
  const bill = model.head?.summary;
  const kind = bill ? closureKind(bill, account.role) : null;
  const changed = !!confirmation && (!bill || confirmationChanged(confirmation, bill));
  const busy = closure.busy.includes(sessionId);
  const locked = busy || closure.pending.some((p) => p.sessionId === sessionId);
  useEffect(() => {
    // Leaving the active view requires a fresh human confirmation when it returns.
    // oxlint-disable-next-line react/set-state-in-effect
    setConfirmation(null);
    setChecked(false);
  }, [model.view.resumeAfter]);
  async function submit() {
    if (!confirmation || !checked || changed || !model.fresh || locked) return;
    await closure.close(confirmation);
    // An older submission may finish after a visibility change and a new confirmation.
    setConfirmation((current) => (current === confirmation ? null : current));
  }
  function dismiss() {
    setConfirmation(null);
    setChecked(false);
  }
  return (
    <section aria-label="本轮结账" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">本轮账单</h3>
        <div className="flex items-center gap-2">
          {bill?.newOrderCount ? (
            <Link
              to="/staff/kitchen"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              去厨房处理
            </Link>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新账单"
            disabled={!model.view.active || model.query.isFetching}
            onClick={() => void model.refresh()}
          >
            <RefreshCw className={cn(model.query.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>
      {closure.notice && <Notice tone="success">{closure.notice}</Notice>}
      {closure.error && (
        <Notice tone="error">
          {closure.error}
          {closure.conflict && (
            <p className="mt-2">
              上次提交被拒绝时：应收 {formatMoney(closure.conflict.totalAmountCents)}，待处理{" "}
              {closure.conflict.newOrderCount} 笔。请核对下方最新账单。
            </p>
          )}
        </Notice>
      )}
      {closure.storageWarning && (
        <Notice tone="warning">
          浏览器无法保存待确认提示，请在当前页面核对结果，刷新前记录本轮用餐编号。
        </Notice>
      )}
      {closure.pending.map((action) => (
        <Notice
          key={action.sessionId}
          tone="warning"
          action={
            <Button
              variant="outline"
              disabled={!model.view.active || closure.busy.includes(action.sessionId)}
              onClick={() => void closure.recover(action)}
            >
              核对原用餐状态
            </Button>
          }
        >
          <span className="break-all">
            关闭结果待确认 · 用餐 #{action.sessionId}。系统不会自动重新提交。
          </span>
        </Notice>
      ))}
      {model.session.isError && <Notice tone="error">{errorMessage(model.session.error)}</Notice>}
      {model.closed && model.session.data ? (
        <div className="space-y-3 rounded-2xl border bg-secondary p-4">
          <h3 className="text-lg font-semibold">{model.session.data.tableLabel} 桌 · 本轮已结束</h3>
          <p>
            {closeLabels[model.session.data.closeReason!]} · 记录金额{" "}
            {formatMoney(model.session.data.totalAmountCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            本轮顾客授权已失效。下一轮用餐须重新开桌。
          </p>
          {account.role === "OWNER" && (
            <Link
              to="/staff/history"
              search={{ sessionId }}
              className={buttonVariants({ variant: "outline" })}
            >
              查看历史账单
            </Link>
          )}
        </div>
      ) : (
        <>
          {!model.fresh && (
            <Notice tone="warning">
              账单正在同步或已过期，暂不能关闭。恢复连接并成功同步后继续。
            </Notice>
          )}
          {bill?.newOrderCount ? (
            <Notice tone="warning">
              仍有 {bill.newOrderCount} 笔待处理订单，请先到厨房完成或按实际情况取消。
            </Notice>
          ) : null}
          {kind && (
            <Button
              size="lg"
              className="w-full"
              disabled={!model.fresh || locked}
              onClick={() => {
                closure.clearFeedback();
                setChecked(false);
                setConfirmation({ kind, bill: { ...bill! } });
              }}
            >
              {kind === "PAID"
                ? "核对收款并清桌"
                : kind === "EMPTY"
                  ? "关闭空桌"
                  : "关闭全部取消的零账单"}
            </Button>
          )}
          {bill &&
            !kind &&
            bill.newOrderCount === 0 &&
            account.role === "STAFF" &&
            bill.totalAmountCents > 0 && (
              <p className="text-sm text-muted-foreground">本轮仍有应收，请由老板核对收款。</p>
            )}
          <BillDetails model={model} />
          <ConfirmDialog
            open={!!confirmation}
            title={`${
              confirmation?.kind === "PAID"
                ? "确认线下收款并清桌"
                : confirmation?.kind === "EMPTY"
                  ? "确认关闭空桌"
                  : "确认全部取消后关闭"
            } · ${confirmation?.bill.tableLabel ?? ""} 桌`}
            description={
              confirmation?.kind === "PAID"
                ? "请完成线下收款，再确认关闭本轮用餐。"
                : "此操作不记录收款。请核对订单并确认顾客已离桌。"
            }
            confirmLabel={confirmation?.kind === "PAID" ? "已线下收款并清桌" : "确认关闭本轮用餐"}
            cancelLabel="返回账单"
            busy={busy}
            confirmDisabled={!checked || changed || locked || !model.fresh}
            initialFocus={checkbox}
            onConfirm={() => void submit()}
            onCancel={dismiss}
          >
            {confirmation && (
              <div className="space-y-4">
                <p className="text-2xl font-semibold tabular-nums">
                  核对金额：{formatMoney(confirmation.bill.totalAmountCents)}
                </p>
                {changed && (
                  <Notice tone="error">
                    账单已变化，原确认已失效。请返回账单，核对最新金额后重新确认。
                  </Notice>
                )}
                <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 font-medium">
                  <Checkbox
                    ref={checkbox}
                    checked={checked}
                    disabled={locked || changed}
                    onCheckedChange={setChecked}
                  />
                  {confirmation.kind === "PAID"
                    ? "已核对桌号和金额，并完成线下收款"
                    : "已核对零账单，确认顾客已离桌"}
                </label>
              </div>
            )}
          </ConfirmDialog>
        </>
      )}
    </section>
  );
}

export function HistoricalBill({
  account,
  sessionId,
  timeZone,
}: {
  account: CurrentAccount;
  sessionId: string;
  timeZone?: string;
}) {
  const model = useBill(account, sessionId, true);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          已关闭账单只读，内容来自本轮用餐和下单快照。
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="刷新历史详情"
          disabled={!model.view.active || model.query.isFetching}
          onClick={() => void model.refresh()}
        >
          <RefreshCw className={cn(model.query.isFetching && "animate-spin")} />
        </Button>
      </div>
      <BillDetails model={model} timeZone={timeZone} />
    </div>
  );
}
