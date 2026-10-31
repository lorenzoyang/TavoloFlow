import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Phone, RefreshCw } from "lucide-react";
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
import {
  formatDateTime,
  formatMoney,
  formatTime,
  RESTAURANT_TIME_ZONE,
  shortId,
} from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { staffMessages, visitTitle } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { billingMessages } from "./messages";
import {
  closeBadges,
  closureKinds,
  confirmationChanged,
  type BillSummary,
  type CloseKind,
  type Confirmation,
} from "./state";
import { useBill } from "./useBill";
import { useClosure } from "./useClosure";

const itemBadges = { NEW: "warning", READY: "success", CANCELLED: "outline" } as const;

function BillOrder({ order, timeZone }: { order: KitchenOrder; timeZone: string }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const c = staffMessages[language];
  const cancelled = order.items.every((item) => item.status === "CANCELLED");
  return (
    <article className={cn("space-y-2 rounded-xl border p-3", cancelled && "bg-muted/60")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={order.status === "NEW" ? "warning" : cancelled ? "outline" : "success"}>
            {order.status === "NEW" ? m.orderNew : m.orderProcessed}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(order.createdAt, language, timeZone)} · #{shortId(order.id)}
          </span>
        </div>
        <span className="font-semibold tabular-nums">
          {m.payable(formatMoney(order.payableAmountCents, language))}
        </span>
      </header>
      {order.payableAmountCents !== order.totalAmountCents && (
        <p className="text-sm text-muted-foreground">
          {m.originalTotal(formatMoney(order.totalAmountCents, language))}
        </p>
      )}
      <ul className="divide-y">
        {order.items.map((item) => {
          const name = displayName(item, order.defaultLanguage, language);
          return (
            <li key={item.id} className="space-y-1 py-2">
              <div className="flex items-start justify-between gap-3">
                <p
                  lang={name.language}
                  className={cn(
                    "min-w-0 wrap-break-word",
                    item.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {item.itemCode && (
                    <span className="mr-2 text-muted-foreground">{item.itemCode}</span>
                  )}
                  {item.quantity} × {name.text}
                </p>
                <p
                  className={cn(
                    "shrink-0 tabular-nums",
                    item.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {formatMoney(item.unitPriceCents * item.quantity, language)}
                </p>
              </div>
              <Badge variant={itemBadges[item.status]}>{m.item[item.status]}</Badge>
              <p className="text-xs text-muted-foreground">
                {m.unitPrice(formatMoney(item.unitPriceCents, language))}
              </p>
              {item.remark && (
                <p className="text-sm whitespace-pre-wrap wrap-break-word">
                  {c.remark(item.remark)}
                </p>
              )}
              {item.readyAt && (
                <p className="text-xs text-muted-foreground">
                  {m.readyAt(formatDateTime(item.readyAt, language, timeZone))}
                </p>
              )}
              {item.cancelledAt && (
                <p className="text-xs text-muted-foreground">
                  {m.cancelledAt(formatDateTime(item.cancelledAt, language, timeZone))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function BillTotal({ bill, timeZone }: { bill: BillSummary; timeZone: string }) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  return (
    <div className="space-y-2 rounded-2xl bg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {bill.status === "CLOSED" ? m.closedAmount : m.totalDue}
        </p>
        <Badge variant={bill.closeReason ? closeBadges[bill.closeReason] : "secondary"}>
          {bill.closeReason ? m.close[bill.closeReason] : m.dining}
        </Badge>
      </div>
      <p className="text-3xl font-semibold tabular-nums">
        {formatMoney(bill.totalAmountCents, language)}
      </p>
      <p className="text-sm text-muted-foreground">
        {m.counts(bill.orderCount, bill.itemCount, bill.newItemCount, bill.cancelledItemCount)}
      </p>
      <p className="text-sm text-muted-foreground">
        {m.times(
          formatDateTime(bill.openedAt, language, timeZone),
          bill.closedAt && formatDateTime(bill.closedAt, language, timeZone),
        )}
      </p>
      <p className="text-xs break-all text-muted-foreground">{m.sessionId(bill.sessionId)}</p>
    </div>
  );
}

function BillDetails({
  model,
  timeZone = RESTAURANT_TIME_ZONE,
}: {
  model: ReturnType<typeof useBill>;
  timeZone?: string;
}) {
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const bill = model.head?.summary;
  return (
    <section aria-label={m.details} className="space-y-4">
      {model.query.isError && (
        <Notice tone="error">{errorMessage(model.query.error, m.readError, language)}</Notice>
      )}
      {!bill && !model.query.isError && <LoadingState label={m.loading} />}
      {bill && (
        <>
          <BillTotal bill={bill} timeZone={timeZone} />
          <p className="text-sm leading-6 text-muted-foreground">
            {m.shown(model.orders.length, bill.orderCount)}
          </p>
          {model.orders.map((order) => (
            <BillOrder key={order.id} order={order} timeZone={timeZone} />
          ))}
          {bill.orderCount === 0 && <p className="text-muted-foreground">{m.noOrders}</p>}
          {model.query.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={!model.view.active || model.query.isFetching}
              onClick={() => void model.query.fetchNextPage()}
            >
              {m.loadMore}
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
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const model = useBill(account, sessionId);
  const closure = useClosure(account);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [checked, setChecked] = useState(false);
  const checkbox = useRef<HTMLElement>(null);
  const bill = model.head?.summary;
  const kinds = bill ? closureKinds(bill, account.role) : [];
  // A pickup visit is picked up, not collected or voided; the wording says so instead of "table".
  const copy = (kind: CloseKind, visit: BillSummary) => {
    if (visit.channel === "PICKUP" && kind !== "EMPTY") return m.pickupClose[kind];
    const paid = kind === "PAID";
    return {
      button: m.closeButton[kind],
      title: m.confirmTitle[kind],
      description: paid ? m.confirmPaid : m.confirmZero,
      checked: paid ? m.checkedPaid : m.checkedZero,
      confirm: paid ? m.confirmPaidLabel : m.confirmZeroLabel,
    };
  };
  const confirming = confirmation ? copy(confirmation.kind, confirmation.bill) : null;
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
    <section aria-label={m.checkout} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{m.bill}</h3>
        <div className="flex items-center gap-2">
          {bill?.newItemCount ? (
            <Link
              to="/staff/kitchen"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {m.toKitchen}
            </Link>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
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
              {m.conflict(
                formatMoney(closure.conflict.totalAmountCents, language),
                closure.conflict.newItemCount,
              )}
            </p>
          )}
        </Notice>
      )}
      {closure.storageWarning && <Notice tone="warning">{m.storageWarning}</Notice>}
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
              {m.verify}
            </Button>
          }
        >
          <span className="break-all">{m.pending(action.sessionId)}</span>
        </Notice>
      ))}
      {model.session.isError && (
        <Notice tone="error">{errorMessage(model.session.error, undefined, language)}</Notice>
      )}
      {model.closed && model.session.data ? (
        <div className="space-y-3 rounded-2xl border bg-secondary p-4">
          <h3 className="text-lg font-semibold">
            {m.closedTitle(visitTitle(model.session.data, language))}
          </h3>
          <p>
            {m.closedSummary(
              m.close[model.session.data.closeReason!],
              formatMoney(model.session.data.totalAmountCents, language),
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {model.session.data.channel === "PICKUP" ? m.closedHintPickup : m.closedHint}
          </p>
          {account.role === "OWNER" && (
            <Link
              to="/staff/history"
              search={{ sessionId }}
              className={buttonVariants({ variant: "outline" })}
            >
              {m.toHistory}
            </Link>
          )}
        </div>
      ) : (
        <>
          {model.stalled && <Notice tone="warning">{m.stalled}</Notice>}
          {bill?.newItemCount ? (
            <Notice tone="warning">{m.waiting(bill.newItemCount)}</Notice>
          ) : null}
          {bill?.pickup && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-xl border bg-card p-3 text-sm">
              <dt className="text-muted-foreground">{m.pickupInfo.number}</dt>
              <dd className="font-semibold tabular-nums">#{bill.pickup.number}</dd>
              <dt className="text-muted-foreground">{m.pickupInfo.name}</dt>
              <dd className="truncate">{bill.pickup.customerName}</dd>
              <dt className="self-center text-muted-foreground">{m.pickupInfo.phone}</dt>
              <dd>
                <a
                  href={`tel:${bill.pickup.customerPhone}`}
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium tabular-nums"
                >
                  <Phone aria-hidden="true" className="size-3.5" />
                  {bill.pickup.customerPhone}
                </a>
              </dd>
              <dt className="text-muted-foreground">{m.pickupInfo.ready}</dt>
              <dd className="tabular-nums">{formatTime(bill.pickup.estimatedReadyAt, language)}</dd>
            </dl>
          )}
          {kinds.map((kind, index) => (
            <Button
              key={kind}
              size="lg"
              variant={index === 0 ? "default" : "outline"}
              className="w-full"
              disabled={!model.fresh || locked}
              onClick={() => {
                closure.clearFeedback();
                setChecked(false);
                setConfirmation({ kind, bill: { ...bill! } });
              }}
            >
              {copy(kind, bill!).button}
            </Button>
          ))}
          {bill &&
            !kinds.length &&
            bill.newItemCount === 0 &&
            account.role === "STAFF" &&
            bill.totalAmountCents > 0 && (
              <p className="text-sm text-muted-foreground">{m.ownerCollects}</p>
            )}
          <BillDetails model={model} />
          <ConfirmDialog
            open={!!confirmation}
            title={
              confirmation && confirming
                ? `${confirming.title} · ${visitTitle(confirmation.bill, language)}`
                : ""
            }
            description={confirming?.description}
            confirmLabel={confirming?.confirm ?? ""}
            cancelLabel={m.backToBill}
            busy={busy}
            confirmDisabled={!checked || changed || locked || !model.fresh}
            initialFocus={checkbox}
            onConfirm={() => void submit()}
            onCancel={dismiss}
          >
            {confirmation && (
              <div className="space-y-4">
                <p className="text-2xl font-semibold tabular-nums">
                  {m.checkAmount(formatMoney(confirmation.bill.totalAmountCents, language))}
                </p>
                {changed && <Notice tone="error">{m.changed}</Notice>}
                <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 font-medium">
                  <Checkbox
                    ref={checkbox}
                    checked={checked}
                    disabled={locked || changed}
                    onCheckedChange={setChecked}
                  />
                  {confirming?.checked}
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
  const m = billingMessages[useStaffLanguage()];
  const model = useBill(account, sessionId, true);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-6 text-muted-foreground">{m.historyHint}</p>
        <Button
          variant="outline"
          size="icon"
          aria-label={m.refreshHistoryDetail}
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
