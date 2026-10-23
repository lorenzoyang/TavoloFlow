import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { displayName } from "@/lib/language";
import { allergenNames } from "@/features/public-menu/messages";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { KitchenOrder } from "./api";
import { canCancel, type OrderStatus } from "./state";
import { useKitchen } from "./useKitchen";

const labels: Record<OrderStatus, string> = { NEW: "待处理", READY: "已完成", CANCELLED: "已取消" };
const rank: Record<OrderStatus, number> = { NEW: 0, READY: 1, CANCELLED: 2 };

function OrderCard({
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
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold wrap-break-word">{order.tableLabel} 桌</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.status === "NEW" ? `已等待 ${minutes} 分钟` : labels[order.status]}
            </p>
          </div>
          <Badge variant={order.status === "CANCELLED" ? "outline" : "secondary"}>
            {labels[order.status]}
          </Badge>
        </header>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="break-all">订单 #{order.id}</p>
          <p>下单：{formatDateTime(order.createdAt)}</p>
        </div>
        <ul className="divide-y divide-border">
          {order.items.map((line) => {
            const name = displayName(line, order.defaultLanguage, "zh");
            return (
              <li key={line.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p lang={name.language} className="min-w-0 text-lg font-medium wrap-break-word">
                    {line.itemCode && (
                      <span className="mr-2 text-sm text-muted-foreground">{line.itemCode}</span>
                    )}
                    {name.text}
                  </p>
                  <span className="shrink-0 text-xl font-bold tabular-nums">× {line.quantity}</span>
                </div>
                {line.remark && (
                  <p className="rounded-lg bg-muted p-2 font-medium whitespace-pre-wrap wrap-break-word">
                    备注：{line.remark}
                  </p>
                )}
                {line.allergenCodes.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    过敏原：
                    {line.allergenCodes.map((code) => allergenNames.zh[code] ?? code).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {order.orderNote && (
          <p className="rounded-lg border border-border bg-muted p-3 font-medium whitespace-pre-wrap wrap-break-word">
            整单备注：{order.orderNote}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          原订单金额：
          <span className={order.status === "CANCELLED" ? "line-through" : ""}>
            {formatMoney(order.totalAmountCents)}
          </span>
        </p>
        {order.readyAt && (
          <p className="text-sm text-muted-foreground">完成：{formatDateTime(order.readyAt)}</p>
        )}
        {order.cancelledAt && (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              取消：{formatDateTime(order.cancelledAt)} · 不计入应收
            </p>
            <p className="whitespace-pre-wrap wrap-break-word">原因：{order.cancelReason}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {order.status === "NEW" && (
            <Button
              className="min-h-12 flex-1"
              disabled={locked}
              onClick={() => void model.perform(order, "ready")}
            >
              <Check />
              整单完成
            </Button>
          )}
          {canCancel(account.role, order.status) && (
            <Button
              variant="outline"
              className="min-h-12 h-auto whitespace-normal"
              disabled={locked}
              onClick={() => cancel(order)}
            >
              {order.status === "READY" ? "作废已完成订单" : "取消整单"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KitchenContent({ account }: { account: CurrentAccount }) {
  const model = useKitchen(account);
  const [confirmation, setConfirmation] = useState<KitchenOrder | null>(null);
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const confirmationPanel = useRef<HTMLElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const confirmationId = confirmation?.id;
  useEffect(() => {
    if (!confirmationId) return;
    confirmationPanel.current?.scrollIntoView({ block: "center" });
    reasonInput.current?.focus({ preventScroll: true });
  }, [confirmationId]);
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{account.restaurantName}</p>
          <h1 className="text-2xl font-semibold">厨房工作台</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            按下单先后处理整单。最早的待处理订单在前。
          </p>
        </div>
        <Link to="/staff" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
          <ArrowLeft />
          返回账号
        </Link>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!model.active || model.query.isFetching}
          onClick={() => void model.refresh()}
        >
          <RefreshCw />
          刷新订单
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          aria-pressed={model.sound}
          onClick={() => void model.toggleSound()}
        >
          {model.sound ? <Volume2 /> : <VolumeX />}
          {model.sound ? "关闭声音提醒" : "开启声音提醒"}
        </Button>
        <Link
          to="/staff/floor"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          开桌与接单设置
        </Link>
        <Link
          to="/staff/menu"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          菜单与供应状态
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">全店待处理：{model.head?.pendingCount ?? "—"} 笔</p>
        <p className="text-sm text-muted-foreground">
          最后成功同步：{model.head ? formatDateTime(model.head.receivedAt) : "尚未同步"}
        </p>
      </div>
      {!model.fresh && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {!model.active
              ? "连接已断开或页面暂停。"
              : model.query.isPending
                ? "正在同步订单。"
                : "订单可能尚未更新。"}{" "}
            暂停状态修改，成功同步后即可继续。
          </AlertDescription>
        </Alert>
      )}
      {model.notice && (
        <Alert role="status">
          <AlertDescription>{model.notice}</AlertDescription>
        </Alert>
      )}
      {(model.error || model.query.isError) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{model.error || "无法更新订单，请检查连接后刷新。"}</AlertDescription>
        </Alert>
      )}
      {model.soundError && (
        <Alert role="status">
          <AlertDescription>{model.soundError}</AlertDescription>
        </Alert>
      )}
      {model.storageWarning && (
        <Alert>
          <AlertDescription>
            浏览器无法保存操作提示。请在当前页面核对待确认结果，刷新前先记录订单编号。
          </AlertDescription>
        </Alert>
      )}
      {model.pending.length > 0 && (
        <section aria-label="待确认操作" className="space-y-3">
          {model.pending.map((action) => (
            <Alert key={action.orderId} role="status">
              <AlertDescription className="space-y-3">
                <p className="break-all">
                  {action.kind === "ready" ? "完成" : "取消"}操作结果待确认 · #{action.orderId}
                </p>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={!model.active || model.busy.includes(action.orderId)}
                  onClick={() => void model.recover(action)}
                >
                  核对原订单状态
                </Button>
              </AlertDescription>
            </Alert>
          ))}
        </section>
      )}
      {confirmation && (
        <section ref={confirmationPanel} aria-label="取消订单确认">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-semibold">
                {confirmation.status === "READY" ? "确认作废已完成订单" : "确认取消整单"} ·{" "}
                {confirmation.tableLabel} 桌
              </h2>
              <p className="break-all text-xs text-muted-foreground">订单 #{confirmation.id}</p>
              <p className="text-sm">
                取消整笔订单后，{formatMoney(confirmation.totalAmountCents)}{" "}
                将不再计入应收。请核对实际情况。
              </p>
              {changed && (
                <Alert variant="destructive">
                  <AlertDescription className="space-y-3">
                    <p>订单已变为“{labels[current.status]}”，原确认已失效。</p>
                    {canCancel(account.role, current.status) && (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={!model.fresh || confirmingBusy}
                        onClick={() => setConfirmation(current)}
                      >
                        按最新状态重新确认
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <label className="block space-y-2 text-sm">
                <span>取消原因（必填，最多 500 字符）</span>
                <textarea
                  ref={reasonInput}
                  className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  maxLength={500}
                  value={reason}
                  disabled={confirmingBusy}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setDrafts((values) => ({ ...values, [confirmation.id]: event.target.value }));
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  className="min-h-11"
                  disabled={!model.fresh || confirmingBusy || changed || !reason.trim()}
                  onClick={() => void submitCancel()}
                >
                  {confirmation.status === "READY" ? "确认作废" : "确认取消整单"}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={confirmingBusy}
                  onClick={() => setConfirmation(null)}
                >
                  返回
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
      <nav aria-label="订单状态" className="flex flex-wrap gap-2">
        {(["NEW", "READY", "CANCELLED"] as const).map((status) => (
          <Button
            key={status}
            className="min-h-11"
            variant={model.status === status ? "default" : "outline"}
            aria-pressed={model.status === status}
            onClick={() => model.setStatus(status)}
          >
            {labels[status]}
          </Button>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        {labels[model.status]}共 {model.head?.totalCount ?? "—"} 笔 · 已显示 {model.orders.length}{" "}
        笔。仅显示正在用餐的订单。
      </p>
      {model.query.isPending && <p role="status">正在读取订单…</p>}
      {!model.query.isPending && !model.query.isError && model.orders.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          暂无{labels[model.status]}订单。
        </p>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {model.orders.map((order) => (
          <OrderCard key={order.id} order={order} model={model} account={account} cancel={cancel} />
        ))}
      </div>
      {model.query.hasNextPage && (
        <Button
          variant="outline"
          className="min-h-12 w-full"
          disabled={!model.active || model.query.isFetching}
          onClick={() => void model.query.fetchNextPage()}
        >
          加载更多订单
        </Button>
      )}
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
