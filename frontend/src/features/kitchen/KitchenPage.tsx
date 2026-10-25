import { useRef, useState } from "react";
import {
  Check,
  ChefHat,
  RefreshCw,
  Sun,
  Timer,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { displayName } from "@/lib/language";
import { allergenNames } from "@/features/public-menu/messages";
import { formatDateTime, formatMoney, formatTime, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/lib/useWakeLock";
import type { KitchenOrder } from "./api";
import { canCancel, waitLevel, type OrderStatus } from "./state";
import { useKitchen } from "./useKitchen";

const labels: Record<OrderStatus, string> = { NEW: "待处理", READY: "已完成", CANCELLED: "已取消" };
const rank: Record<OrderStatus, number> = { NEW: 0, READY: 1, CANCELLED: 2 };
const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
  overdue: "bg-destructive text-white",
};
const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";

// One ticket per order, readable from across the kitchen: table, waiting time, quantities and notes first.
function OrderTicket({
  order,
  model,
  account,
  cancel,
}: {
  order: KitchenOrder;
  model: ReturnType<typeof useKitchen>;
  account: CurrentAccount;
  cancel: (order: KitchenOrder) => void;
}) {
  const locked =
    !model.fresh ||
    model.busy.includes(order.id) ||
    model.pending.some((p) => p.orderId === order.id);
  const minutes = Math.max(0, Math.floor((model.now - Date.parse(order.createdAt)) / 60_000));
  const cancelled = order.status === "CANCELLED";
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs",
        cancelled && "bg-muted/60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold wrap-break-word">{order.tableLabel} 桌</h2>
          <p className="text-sm text-muted-foreground">
            {formatTime(order.createdAt)} 下单 · #{shortId(order.id)}
          </p>
        </div>
        {order.status === "NEW" ? (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
              waitStyles[waitLevel(minutes)],
            )}
          >
            <Timer aria-hidden="true" className="size-4" />
            已等待 {minutes} 分钟
          </span>
        ) : (
          <Badge variant={order.status === "READY" ? "success" : "outline"}>
            {labels[order.status]}
          </Badge>
        )}
      </header>
      <ul className="divide-y border-y">
        {order.items.map((line) => {
          const name = displayName(line, order.defaultLanguage, "zh");
          return (
            <li key={line.id} className="flex gap-3 py-2.5">
              <span className="w-12 shrink-0 text-2xl leading-7 font-bold tabular-nums">
                {line.quantity}×
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p lang={name.language} className="text-lg leading-7 font-medium wrap-break-word">
                  {line.itemCode && (
                    <span className="mr-2 text-sm text-muted-foreground">{line.itemCode}</span>
                  )}
                  {name.text}
                </p>
                {line.remark && (
                  <p className="rounded-lg bg-warning/20 px-2.5 py-1.5 font-medium whitespace-pre-wrap wrap-break-word">
                    备注：{line.remark}
                  </p>
                )}
                {line.allergenCodes.length > 0 && (
                  <p className="flex items-start gap-1 text-sm text-muted-foreground">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    过敏原：
                    {line.allergenCodes.map((code) => allergenNames.zh[code] ?? code).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {order.orderNote && (
        <p className="rounded-xl border border-warning/60 bg-warning/12 p-3 font-medium whitespace-pre-wrap wrap-break-word">
          整单备注：{order.orderNote}
        </p>
      )}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          原订单金额：
          <span className={cn("tabular-nums", cancelled && "line-through")}>
            {formatMoney(order.totalAmountCents)}
          </span>
        </p>
        {order.readyAt && <p>完成：{formatDateTime(order.readyAt)}</p>}
        {order.cancelledAt && (
          <>
            <p>取消：{formatDateTime(order.cancelledAt)} · 不计入应收</p>
            <p className="whitespace-pre-wrap text-foreground wrap-break-word">
              原因：{order.cancelReason}
            </p>
          </>
        )}
      </div>
      {(order.status === "NEW" || canCancel(account.role, order.status)) && (
        <div className="mt-auto grid gap-2">
          {order.status === "NEW" && (
            <Button size="lg" disabled={locked} onClick={() => void model.perform(order, "ready")}>
              <Check />
              整单完成
            </Button>
          )}
          {canCancel(account.role, order.status) && (
            <Button variant="outline" disabled={locked} onClick={() => cancel(order)}>
              {order.status === "READY" ? "作废已完成订单" : "取消整单"}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function KitchenContent({ account }: { account: CurrentAccount }) {
  const model = useKitchen(account);
  const wakeLock = useWakeLock();
  const [confirmation, setConfirmation] = useState<KitchenOrder | null>(null);
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const candidates = confirmation
    ? [
        confirmation,
        model.latest[confirmation.id],
        model.query.data?.pages
          .flatMap((page) => page.items)
          .find((order) => order.id === confirmation.id),
      ].filter((o): o is KitchenOrder => !!o)
    : [];
  const current = candidates.sort((a, b) => rank[b.status] - rank[a.status])[0];
  const changed = !!confirmation && current?.status !== confirmation.status;
  const confirmingBusy =
    !!confirmation &&
    (model.busy.includes(confirmation.id) ||
      model.pending.some((p) => p.orderId === confirmation.id));
  const cancel = (order: KitchenOrder) => {
    setConfirmation(order);
    setReason(drafts[order.id] ?? "");
  };
  async function submitCancel() {
    if (!confirmation || changed || !reason.trim() || reason.trim().length > 500) return;
    const result = await model.perform(confirmation, "cancel", reason);
    if (result) {
      setConfirmation(null);
      setReason("");
      setDrafts((values) => {
        const next = { ...values };
        delete next[result.id];
        return next;
      });
    }
  }
  return (
    <div>
      <PageHeader
        title="厨房"
        description="按下单先后处理整单，最早的待处理订单在前。"
        actions={
          <>
            <Button
              variant="outline"
              className={toggleStyle}
              aria-pressed={model.sound}
              aria-label="声音提醒"
              onClick={model.toggleSound}
            >
              {model.sound ? <Volume2 /> : <VolumeX />}
              <span className="hidden sm:inline">声音提醒</span>
            </Button>
            {wakeLock.supported && (
              <Button
                variant="outline"
                className={toggleStyle}
                aria-pressed={wakeLock.enabled}
                aria-label="屏幕常亮"
                onClick={wakeLock.toggle}
              >
                <Sun />
                <span className="hidden sm:inline">屏幕常亮</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="刷新订单"
              disabled={!model.active || model.query.isFetching}
              onClick={() => void model.refresh()}
            >
              <RefreshCw className={cn(model.query.isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-3 shadow-xs">
          <p className="font-semibold">全店待处理 {model.summary?.pendingCount ?? "—"} 笔</p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-2.5 rounded-full",
                model.stalled
                  ? "bg-destructive"
                  : model.summary
                    ? "bg-success"
                    : "bg-muted-foreground/40",
              )}
            />
            {model.summary
              ? `最后成功同步：${formatDateTime(model.summary.receivedAt)}`
              : "尚未同步"}
          </p>
        </div>
        {model.stalled && (
          <Notice tone="error">
            {!model.active
              ? "连接已断开或页面暂停。"
              : model.query.isPending
                ? "正在同步订单。"
                : "订单可能尚未更新。"}{" "}
            暂停状态修改，成功同步后即可继续。
          </Notice>
        )}
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || model.query.isError) && (
          <Notice tone="error">{model.error || "无法更新订单，请检查连接后刷新。"}</Notice>
        )}
        {model.soundBlocked && (
          <Notice
            tone="warning"
            action={
              <Button variant="outline" onClick={model.unlockSound}>
                <Volume2 />
                开启声音
              </Button>
            }
          >
            浏览器要求先点按一次页面才能播放提醒声。点按页面任意位置即可开启。
          </Notice>
        )}
        {model.soundError && <Notice tone="warning">{model.soundError}</Notice>}
        {wakeLock.failed && (
          <Notice tone="warning">
            未能保持屏幕常亮（浏览器拒绝或处于省电模式），可点按「屏幕常亮」重试。
          </Notice>
        )}
        {model.storageWarning && (
          <Notice tone="warning">
            浏览器无法保存操作提示。请在当前页面核对待确认结果，刷新前先记录订单编号。
          </Notice>
        )}
        {model.pending.length > 0 && (
          <section aria-label="待确认操作" className="space-y-3">
            {model.pending.map((action) => (
              <Notice
                key={action.orderId}
                tone="warning"
                action={
                  <Button
                    variant="outline"
                    disabled={!model.active || model.busy.includes(action.orderId)}
                    onClick={() => void model.recover(action)}
                  >
                    核对原订单状态
                  </Button>
                }
              >
                <span className="break-all">
                  {action.kind === "ready" ? "完成" : "取消"}操作结果待确认 · #{action.orderId}
                </span>
              </Notice>
            ))}
          </section>
        )}
      </div>
      <Tabs
        value={model.status}
        onValueChange={(status: OrderStatus) => model.setStatus(status)}
        className="gap-4"
      >
        <TabsList aria-label="订单状态" className="w-full sm:w-auto">
          {(["NEW", "READY", "CANCELLED"] as const).map((status) => (
            <TabsTrigger key={status} value={status}>
              {labels[status]}
              {status === "NEW" && !!model.summary?.pendingCount && (
                <Badge variant="warning" className="h-5 px-1.5">
                  {model.summary.pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={model.status} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {labels[model.status]}共 {model.head?.totalCount ?? "—"} 笔 · 已显示{" "}
            {model.orders.length} 笔。仅显示正在用餐的订单。
          </p>
          {model.query.isPending && <LoadingState label="正在读取订单…" />}
          {!model.query.isPending && !model.query.isError && model.orders.length === 0 && (
            <EmptyState icon={ChefHat} title={`暂无${labels[model.status]}订单。`} />
          )}
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {model.orders.map((order) => (
              <OrderTicket
                key={order.id}
                order={order}
                model={model}
                account={account}
                cancel={cancel}
              />
            ))}
          </div>
          {model.query.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={!model.active || model.query.isFetching}
              onClick={() => void model.query.fetchNextPage()}
            >
              加载更多订单
            </Button>
          )}
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={!!confirmation}
        tone="destructive"
        title={`${confirmation?.status === "READY" ? "确认作废已完成订单" : "确认取消整单"} · ${confirmation?.tableLabel ?? ""} 桌`}
        description={
          confirmation &&
          `取消整笔订单后，${formatMoney(confirmation.totalAmountCents)} 将不再计入应收。请核对实际情况。`
        }
        confirmLabel={confirmation?.status === "READY" ? "确认作废" : "确认取消整单"}
        cancelLabel="返回"
        busy={confirmingBusy}
        confirmDisabled={!model.fresh || changed || !reason.trim()}
        initialFocus={reasonInput}
        onConfirm={() => void submitCancel()}
        onCancel={() => setConfirmation(null)}
      >
        {confirmation && (
          <div className="space-y-4">
            <p className="text-xs break-all text-muted-foreground">订单 #{confirmation.id}</p>
            {changed && (
              <Notice
                tone="error"
                action={
                  canCancel(account.role, current.status) && (
                    <Button
                      variant="outline"
                      disabled={!model.fresh || confirmingBusy}
                      onClick={() => setConfirmation(current)}
                    >
                      按最新状态重新确认
                    </Button>
                  )
                }
              >
                订单已变为“{labels[current.status]}”，原确认已失效。
              </Notice>
            )}
            <label className="block space-y-2 text-sm font-medium">
              <span className="block">取消原因（必填，最多 500 字符）</span>
              <Textarea
                ref={reasonInput}
                className="min-h-24"
                maxLength={500}
                value={reason}
                disabled={confirmingBusy}
                onChange={(event) => {
                  setReason(event.target.value);
                  setDrafts((values) => ({ ...values, [confirmation.id]: event.target.value }));
                }}
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function KitchenPage() {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <KitchenContent key={`${account.restaurantId}:${account.userId}`} account={account} />
      )}
    </AuthBoundary>
  );
}
