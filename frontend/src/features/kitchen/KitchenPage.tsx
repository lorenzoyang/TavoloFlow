import { useEffect, useState } from "react";
import {
  Check,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { OrderLine } from "@/features/orders/api";
import { onLifecycleChange } from "@/lib/useLiveView";
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

const labels: Record<OrderStatus, string> = { NEW: "待处理", PROCESSED: "已处理" };
const itemLabels = { NEW: "待出餐", READY: "已出餐", CANCELLED: "已取消" };
type ItemConfirmation = { order: KitchenOrder; item: OrderLine };
const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
  overdue: "bg-destructive text-white",
};
const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";

// Keep every line in its original position until the whole ticket is processed.
function OrderTicket({
  order,
  model,
  cancel,
}: {
  order: KitchenOrder;
  model: ReturnType<typeof useKitchen>;
  cancel: (order: KitchenOrder, item: OrderLine) => void;
}) {
  const locked =
    !model.fresh ||
    model.busy.includes(order.id) ||
    model.pending.some((p) => p.orderId === order.id);
  const minutes = Math.max(0, Math.floor((model.now - Date.parse(order.createdAt)) / 60_000));
  const cancelled = order.items.every((i) => i.status === "CANCELLED");
  const waiting = order.items.filter((i) => i.status === "NEW").length;
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
          <p className="mt-1 text-sm font-medium">
            待出餐 {waiting} 项／共 {order.items.length} 项
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
          <Badge variant={cancelled ? "outline" : "success"}>
            {cancelled ? "全部已取消" : "已处理"}
          </Badge>
        )}
      </header>
      <ul className="divide-y border-y">
        {order.items.map((line) => {
          const name = displayName(line, order.defaultLanguage, "zh");
          const compact = order.status === "NEW" && line.status !== "NEW";
          return (
            <li
              key={line.id}
              className={cn("space-y-2 py-2.5", compact && "py-1.5 text-sm text-muted-foreground")}
            >
              <div className="flex items-start gap-2">
                {line.status === "READY" && (
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                )}
                <p
                  lang={name.language}
                  className={cn(
                    "min-w-0 flex-1 font-medium wrap-break-word",
                    !compact && "text-lg leading-7",
                    line.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {line.itemCode && (
                    <span className="mr-2 text-sm text-muted-foreground">{line.itemCode}</span>
                  )}
                  {name.text} ×{line.quantity}
                </p>
                {line.status !== "NEW" && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {itemLabels[line.status]}
                  </span>
                )}
              </div>
              {!compact && (
                <>
                  {line.remark && (
                    <p
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 font-medium whitespace-pre-wrap wrap-break-word",
                        line.status === "NEW" ? "bg-warning/20" : "bg-secondary",
                      )}
                    >
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
                  {line.readyAt && (
                    <p className="text-xs text-muted-foreground">
                      出餐：{formatDateTime(line.readyAt)}
                    </p>
                  )}
                  {line.cancelledAt && (
                    <p className="text-xs text-muted-foreground">
                      取消：{formatDateTime(line.cancelledAt)} · 不计入应收
                    </p>
                  )}
                </>
              )}
              {line.status === "NEW" && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={locked}
                    onClick={() => void model.perform(order, line, "ready")}
                  >
                    <Check />
                    出餐完成
                  </Button>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={locked}
                          aria-label={`${name.text}的更多操作`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={locked}
                        onClick={() => cancel(order, line)}
                      >
                        取消菜品
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {order.orderNote && (
        <p
          className={cn(
            "rounded-xl border p-3 font-medium whitespace-pre-wrap wrap-break-word",
            order.status === "NEW" ? "border-warning/60 bg-warning/12" : "bg-secondary",
          )}
        >
          整单备注：{order.orderNote}
        </p>
      )}
      {order.status === "PROCESSED" && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            原订单金额：{formatMoney(order.totalAmountCents)} · 应收：
            {formatMoney(order.payableAmountCents)}
          </p>
          {order.processedAt && <p>处理完毕：{formatDateTime(order.processedAt)}</p>}
        </div>
      )}
    </article>
  );
}

function KitchenContent({ account }: { account: CurrentAccount }) {
  const model = useKitchen(account);
  const wakeLock = useWakeLock();
  const [confirmation, setConfirmation] = useState<ItemConfirmation | null>(null);
  useEffect(() => onLifecycleChange(() => setConfirmation(null)), []);
  const candidates = confirmation
    ? [
        model.latest[confirmation.order.id],
        model.query.data?.pages
          .flatMap((page) => page.items)
          .find((o) => o.id === confirmation.order.id),
      ].flatMap((o) => o?.items.filter((i) => i.id === confirmation.item.id) ?? [])
    : [];
  // Terminal states cannot be undone. Any observed terminal response invalidates the confirmation.
  const current = candidates.find((i) => i.status !== "NEW") ?? candidates[0] ?? confirmation?.item;
  const changed = !!confirmation && current?.status !== "NEW";
  const confirmingBusy =
    !!confirmation &&
    (model.busy.includes(confirmation.order.id) ||
      model.pending.some((p) => p.orderId === confirmation.order.id));
  const cancel = (order: KitchenOrder, item: OrderLine) => {
    if (canCancel(item.status)) setConfirmation({ order, item });
  };
  async function submitCancel() {
    if (!confirmation || changed) return;
    if (await model.perform(confirmation.order, confirmation.item, "cancel")) setConfirmation(null);
  }
  return (
    <div>
      <PageHeader
        title="厨房"
        description="逐项标记出餐，最早的待处理订单在前。"
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
                    核对菜品状态
                  </Button>
                }
              >
                <span className="break-all">
                  {action.kind === "ready" ? "完成" : "取消"}操作结果待确认 · 订单 #
                  {shortId(action.orderId)}
                  {action.itemId ? ` · 菜品 #${shortId(action.itemId)}` : " · 旧版整单操作"}
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
          {(["NEW", "PROCESSED"] as const).map((status) => (
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
              <OrderTicket key={order.id} order={order} model={model} cancel={cancel} />
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
        title={`确认取消菜品 · ${confirmation?.order.tableLabel ?? ""} 桌`}
        description={
          confirmation &&
          `取消「${displayName(confirmation.item, confirmation.order.defaultLanguage, "zh").text} ×${confirmation.item.quantity}」后，${formatMoney(confirmation.item.unitPriceCents * confirmation.item.quantity)} 将不计入应收。请先与厨房确认不再制作。`
        }
        confirmLabel="确认取消菜品"
        cancelLabel="返回"
        busy={confirmingBusy}
        confirmDisabled={!model.fresh || changed}
        onConfirm={() => void submitCancel()}
        onCancel={() => setConfirmation(null)}
      >
        {changed && (
          <Notice tone="error">
            菜品已变为“{current ? itemLabels[current.status] : "未知"}”，本次取消确认已失效。
          </Notice>
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
