import { useEffect, useState } from "react";
import { ChefHat, ListFilter, RefreshCw, Sun, Volume2, VolumeX } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import type { OrderLine } from "@/features/orders/api";
import { formatDateTime, formatMoney, shortId } from "@/lib/format";
import { displayName } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { onLifecycleChange } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/lib/useWakeLock";
import type { KitchenOrder } from "./api";
import { CategoryDialog } from "./CategoryDialog";
import { DishCard, OrderTicket, type LineControls } from "./KitchenViews";
import { kitchenMessages } from "./messages";
import { canCancel, type KitchenView } from "./state";
import { useKitchen } from "./useKitchen";

type ItemConfirmation = { order: KitchenOrder; item: OrderLine };

const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";

function KitchenContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
  const model = useKitchen(account);
  const wakeLock = useWakeLock();
  // Cancelling a line needs a human confirmation, which a lifecycle change withdraws.
  const [confirmation, setConfirmation] = useState<ItemConfirmation | null>(null);
  useEffect(() => onLifecycleChange(() => setConfirmation(null)), []);

  const controls: LineControls = {
    now: model.now,
    isLocked: (order) =>
      !model.fresh ||
      model.busy.includes(order.id) ||
      model.pending.some((p) => p.orderId === order.id),
    ready: (order, line) => void model.perform(order, line, "ready"),
    cancel: (order, line) => {
      if (canCancel(line.status)) setConfirmation({ order, item: line });
    },
  };

  // The confirmed line as last seen in a write result or a poll.
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
        value={model.view}
        onValueChange={(view: KitchenView) => model.setView(view)}
        className="gap-4"
      >
        <TabsList aria-label={m.viewTabs} className="w-full sm:w-auto">
          {(["DISHES", "NEW", "PROCESSED"] as const).map((view) => (
            <TabsTrigger key={view} value={view}>
              {m.view[view]}
              {view === "NEW" && !!model.summary?.pendingCount && (
                <Badge variant="warning" className="h-5 px-1.5">
                  {model.summary.pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={model.view} className="space-y-4">
          {model.view === "DISHES" ? (
            // The category setting sits where it applies: only this view and its chime use it.
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {m.dishSummary(
                  model.dishes.length,
                  model.dishes.reduce((sum, group) => sum + group.quantity, 0),
                )}
              </p>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => model.categories.setChoosing(true)}
              >
                <ListFilter />
                {m.categories}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {m.listSummary(
                m.status[model.status],
                model.head?.totalCount ?? "—",
                model.orders.length,
              )}
            </p>
          )}
          {model.view === "DISHES" &&
            model.categories.hidden.length > 0 &&
            (model.categories.menu.isError && !model.categories.menu.data ? (
              <Notice tone="warning">{m.categoriesError}</Notice>
            ) : (
              model.categories.hiddenCount > 0 && (
                <Notice>{m.hiddenCategories(model.categories.hiddenCount)}</Notice>
              )
            ))}
          {model.view === "DISHES" && model.query.hasNextPage && (
            <Notice tone="warning">{m.dishesIncomplete}</Notice>
          )}
          {model.query.isPending && <LoadingState label={m.loading} />}
          {!model.query.isPending &&
            !model.query.isError &&
            (model.view === "DISHES" ? model.dishes : model.orders).length === 0 && (
              <EmptyState
                icon={ChefHat}
                title={model.view === "DISHES" ? m.emptyDishes : m.empty[model.status]}
              />
            )}
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {model.view === "DISHES"
              ? model.dishes.map((group) => (
                  <DishCard key={group.key} group={group} controls={controls} />
                ))
              : model.orders.map((order) => (
                  <OrderTicket key={order.id} order={order} controls={controls} />
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
      <CategoryDialog setting={model.categories} />
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
