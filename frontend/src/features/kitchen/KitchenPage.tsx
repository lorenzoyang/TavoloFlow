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
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/lib/useWakeLock";
import type { KitchenOrder } from "./api";
import { kitchenMessages } from "./messages";
import { canCancel, waitLevel, type OrderStatus } from "./state";
import { useKitchen } from "./useKitchen";

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
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
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
          <h2 className="text-2xl font-bold wrap-break-word">{c.table(order.tableLabel)}</h2>
          <p className="text-sm text-muted-foreground">
            {m.orderedAt(formatTime(order.createdAt, language))} · #{shortId(order.id)}
          </p>
          <p className="mt-1 text-sm font-medium">{m.itemsWaiting(waiting, order.items.length)}</p>
        </div>
        {order.status === "NEW" ? (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
              waitStyles[waitLevel(minutes)],
            )}
          >
            <Timer aria-hidden="true" className="size-4" />
            {m.waited(minutes)}
          </span>
        ) : (
          <Badge variant={cancelled ? "outline" : "success"}>
            {cancelled ? m.allCancelled : m.processed}
          </Badge>
        )}
      </header>
      <ul className="divide-y border-y">
        {order.items.map((line) => {
          const name = displayName(line, order.defaultLanguage, language);
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
                    {m.item[line.status]}
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
                      {c.remark(line.remark)}
                    </p>
                  )}
                  {line.allergenCodes.length > 0 && (
                    <p className="flex items-start gap-1 text-sm text-muted-foreground">
                      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      {m.allergens}
                      {line.allergenCodes
                        .map((code) => allergenNames[language][code] ?? code)
                        .join(" · ")}
                    </p>
                  )}
                  {line.readyAt && (
                    <p className="text-xs text-muted-foreground">
                      {m.readyAt(formatDateTime(line.readyAt, language))}
                    </p>
                  )}
                  {line.cancelledAt && (
                    <p className="text-xs text-muted-foreground">
                      {m.cancelledAt(formatDateTime(line.cancelledAt, language))}
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
                    {m.ready}
                  </Button>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={locked}
                          aria-label={m.moreActions(name.text)}
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
                        {m.cancelItem}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {order.status === "PROCESSED" && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {m.amounts(
              formatMoney(order.totalAmountCents, language),
              formatMoney(order.payableAmountCents, language),
            )}
          </p>
          {order.processedAt && <p>{m.processedAt(formatDateTime(order.processedAt, language))}</p>}
        </div>
      )}
    </article>
  );
}

function KitchenContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
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
        title={m.title}
        description={m.description}
        actions={
          <>
            <Button
              variant="outline"
              className={toggleStyle}
              aria-pressed={model.sound}
              aria-label={c.sound}
              onClick={model.toggleSound}
            >
              {model.sound ? <Volume2 /> : <VolumeX />}
              <span className="hidden sm:inline">{c.sound}</span>
            </Button>
            {wakeLock.supported && (
              <Button
                variant="outline"
                className={toggleStyle}
                aria-pressed={wakeLock.enabled}
                aria-label={c.wakeLock}
                onClick={wakeLock.toggle}
              >
                <Sun />
                <span className="hidden sm:inline">{c.wakeLock}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={m.refresh}
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
          <p className="font-semibold">{m.pendingTotal(model.summary?.pendingCount ?? "—")}</p>
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
              ? c.lastSync(formatDateTime(model.summary.receivedAt, language))
              : c.notSynced}
          </p>
        </div>
        {model.stalled && (
          <Notice tone="error">
            {!model.active ? c.disconnected : model.query.isPending ? m.syncing : m.maybeStale}{" "}
            {m.writesPaused}
          </Notice>
        )}
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || model.query.isError) && (
          <Notice tone="error">{model.error || m.readError}</Notice>
        )}
        {model.soundBlocked && (
          <Notice
            tone="warning"
            action={
              <Button variant="outline" onClick={model.unlockSound}>
                <Volume2 />
                {c.soundOn}
              </Button>
            }
          >
            {c.soundBlocked}
          </Notice>
        )}
        {model.soundUnsupported && <Notice tone="warning">{c.soundUnsupported}</Notice>}
        {wakeLock.failed && <Notice tone="warning">{c.wakeLockFailed}</Notice>}
        {model.storageWarning && <Notice tone="warning">{m.storageWarning}</Notice>}
        {model.pending.length > 0 && (
          <section aria-label={m.pendingSection} className="space-y-3">
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
                    {m.verify}
                  </Button>
                }
              >
                <span className="break-all">
                  {m.pendingAction(
                    action.kind,
                    shortId(action.orderId),
                    action.itemId && shortId(action.itemId),
                  )}
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
        <TabsList aria-label={m.statusTabs} className="w-full sm:w-auto">
          {(["NEW", "PROCESSED"] as const).map((status) => (
            <TabsTrigger key={status} value={status}>
              {m.status[status]}
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
            {m.listSummary(
              m.status[model.status],
              model.head?.totalCount ?? "—",
              model.orders.length,
            )}
          </p>
          {model.query.isPending && <LoadingState label={m.loading} />}
          {!model.query.isPending && !model.query.isError && model.orders.length === 0 && (
            <EmptyState icon={ChefHat} title={m.empty[model.status]} />
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
              {m.loadMore}
            </Button>
          )}
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={!!confirmation}
        tone="destructive"
        title={m.cancelTitle(c.table(confirmation?.order.tableLabel ?? ""))}
        description={
          confirmation &&
          m.cancelHint(
            `${displayName(confirmation.item, confirmation.order.defaultLanguage, language).text} ×${confirmation.item.quantity}`,
            formatMoney(confirmation.item.unitPriceCents * confirmation.item.quantity, language),
          )
        }
        confirmLabel={m.confirmCancel}
        cancelLabel={c.back}
        busy={confirmingBusy}
        confirmDisabled={!model.fresh || changed}
        onConfirm={() => void submitCancel()}
        onCancel={() => setConfirmation(null)}
      >
        {changed && (
          <Notice tone="error">
            {m.changed(current ? m.item[current.status] : m.unknownStatus)}
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
