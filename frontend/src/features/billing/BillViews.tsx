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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccount } from "@/features/accounts/api";
import type { KitchenOrder } from "@/features/kitchen/api";
import { ContactActions, DeliveryAddress } from "@/features/online/DeliveryAddress";
import { typedDeliveryFee } from "@/features/online/state";
import { displayName } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { formatPhone } from "@/lib/phone";
import {
  formatCents,
  formatDateTime,
  formatMoney,
  formatTime,
  RESTAURANT_TIME_ZONE,
  shortId,
} from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { sessionTitle } from "@/lib/session-label";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { billingMessages, closeLabel } from "./messages";
import {
  billAmounts,
  canEditDeliveryFee,
  closeBadges,
  closureKind,
  confirmationChanged,
  noShowAllowed,
  totalWithFee,
  type BillSummary,
  type CloseKind,
  type Confirmation,
} from "./state";
import { useBill } from "./useBill";
import { useClosure } from "./useClosure";
import { useDeliveryFee } from "./useDeliveryFee";

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
          {m.orderDishes(formatMoney(order.payableAmountCents, language))}
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
              {item.options.length > 0 && (
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {optionSummary(item.options, order.defaultLanguage, language)}
                </p>
              )}
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
  const online = bill.online;
  const amounts = billAmounts(bill);
  const opened = formatDateTime(bill.openedAt, language, timeZone);
  const closed = bill.closedAt && formatDateTime(bill.closedAt, language, timeZone);
  return (
    <div className="space-y-2 rounded-2xl bg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {bill.status === "CLOSED" ? m.closedAmount : online ? m.online.totalDue : m.totalDue}
        </p>
        <Badge variant={bill.closeReason ? closeBadges[bill.closeReason] : "secondary"}>
          {bill.closeReason
            ? closeLabel(language, bill.closeReason, bill.channel)
            : online
              ? m.online.active
              : m.dining}
        </Badge>
      </div>
      <p className="text-3xl font-semibold tabular-nums">
        {formatMoney(bill.totalAmountCents, language)}
      </p>
      {(amounts.fee !== null || amounts.coupon) && (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm">
          <dt className="text-muted-foreground">{m.online.itemsAmount}</dt>
          <dd className="text-right tabular-nums">{formatMoney(amounts.items, language)}</dd>
          {amounts.coupon && (
            <>
              <dt className="text-muted-foreground wrap-break-word">
                {m.online.coupon(amounts.coupon.code, amounts.coupon.percentOff)}
              </dt>
              <dd className="text-right tabular-nums">
                −{formatMoney(amounts.discount, language)}
              </dd>
            </>
          )}
          {amounts.fee !== null && (
            <>
              <dt className="text-muted-foreground">{m.online.deliveryFee}</dt>
              <dd
                className={cn(
                  "text-right tabular-nums",
                  !amounts.feeCounted && "text-muted-foreground line-through",
                )}
              >
                {formatMoney(amounts.fee, language)}
              </dd>
              {!amounts.feeCounted && (
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {m.online.feeNotCounted}
                </dd>
              )}
            </>
          )}
        </dl>
      )}
      <p className="text-sm text-muted-foreground">
        {m.counts(bill.orderCount, bill.itemCount, bill.newItemCount, bill.cancelledItemCount)}
      </p>
      {online && (
        <div className="space-y-2 border-t pt-2">
          {online.customerName && (
            <p className="font-medium wrap-break-word">{online.customerName}</p>
          )}
          {online.customerPhone && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatPhone(online.customerPhone)}
            </p>
          )}
          {bill.status === "ACTIVE" && (
            <p className="text-sm">
              {m.online.estimated(formatTime(online.estimatedAt, language, timeZone))}
            </p>
          )}
          {bill.channel === "DELIVERY" && online.deliveryAddress && (
            <DeliveryAddress address={online.deliveryAddress} notes={online.deliveryNotes} />
          )}
          <ContactActions
            phone={online.customerPhone}
            address={bill.channel === "DELIVERY" ? online.deliveryAddress : null}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {online ? m.online.times(opened, closed) : m.times(opened, closed)}
      </p>
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
          {/* Only while some orders are not loaded; the amount above always counts them all. */}
          {model.query.hasNextPage && (
            <p className="text-sm leading-6 text-muted-foreground">
              {m.shown(model.orders.length, bill.orderCount)}
            </p>
          )}
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
  const fees = useDeliveryFee(account);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [checked, setChecked] = useState(false);
  const checkbox = useRef<HTMLElement>(null);
  // The fee being corrected, frozen with the bill it was read from.
  const [feeEdit, setFeeEdit] = useState<{ bill: BillSummary; text: string } | null>(null);
  const feeInput = useRef<HTMLInputElement>(null);
  const bill = model.head?.summary;
  const kind = bill ? closureKind(bill, account.role) : null;
  const changed = !!confirmation && (!bill || confirmationChanged(confirmation, bill));
  // Online orders are worded for a customer who collects or receives a delivery, who never came or
  // refused it, or who was told nothing will come.
  const confirming = confirmation?.kind ?? "VOIDED";
  const online = !!confirmation?.bill.online;
  const delivery = confirmation?.bill.channel === "DELIVERY";
  const copy =
    confirming === "NO_SHOW"
      ? delivery
        ? {
            title: m.online.notDeliveredTitle,
            description: m.online.confirmNotDelivered,
            label: m.online.confirmNotDeliveredLabel,
            checked: m.online.checkedNotDelivered,
          }
        : {
            title: m.confirmTitle.NO_SHOW,
            description: m.online.confirmNoShow,
            label: m.online.confirmNoShowLabel,
            checked: m.online.checkedNoShow,
          }
      : confirming === "PAID"
        ? delivery
          ? {
              title: m.online.deliveredTitle,
              description: m.online.confirmDelivered,
              label: m.online.confirmDeliveredLabel,
              checked: m.online.checkedDelivered,
            }
          : online
            ? {
                title: m.online.paidTitle,
                description: m.online.confirmPaid,
                label: m.online.confirmPaidLabel,
                checked: m.online.checkedPaid,
              }
            : {
                title: m.confirmTitle.PAID,
                description: m.confirmPaid,
                label: m.confirmPaidLabel,
                checked: m.checkedPaid,
              }
        : {
            title: m.confirmTitle[confirming],
            description: online ? m.online.confirmZero : m.confirmZero,
            label: m.confirmZeroLabel,
            checked: online ? m.online.checkedZero : m.checkedZero,
          };
  function confirm(next: CloseKind) {
    closure.clearFeedback();
    fees.clearNotice();
    setChecked(false);
    setConfirmation({ kind: next, bill: { ...bill! } });
  }
  const busy = closure.busy.includes(sessionId);
  // A fee correction and a closure never run together on one bill.
  const locked = busy || fees.busy || closure.pending.some((p) => p.sessionId === sessionId);
  const fee = feeEdit ? typedDeliveryFee(feeEdit.text, billAmounts(feeEdit.bill).items) : null;
  const feeChanged =
    !!feeEdit && (!bill || confirmationChanged({ kind: "PAID", bill: feeEdit.bill }, bill));
  useEffect(() => {
    // Leaving the active view requires a fresh human confirmation when it returns.
    // oxlint-disable-next-line react/set-state-in-effect
    setConfirmation(null);
    setChecked(false);
    setFeeEdit(null);
  }, [model.view.resumeAfter]);
  function editFee() {
    closure.clearFeedback();
    fees.clearNotice();
    setFeeEdit({ bill: { ...bill! }, text: formatCents(bill!.deliveryFeeCents ?? 0) });
  }
  async function saveFee() {
    if (!feeEdit || fee === null || feeChanged || !model.fresh || locked) return;
    const editing = feeEdit;
    await fees.save(editing.bill, fee);
    // Whatever happened, the bill is reread; a new correction starts from it.
    setFeeEdit((current) => (current === editing ? null : current));
  }
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
      {fees.notice && <Notice tone={fees.notice.tone}>{fees.notice.text}</Notice>}
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
          {m.pending(shortId(action.sessionId))}
        </Notice>
      ))}
      {model.session.isError && (
        <Notice tone="error">{errorMessage(model.session.error, undefined, language)}</Notice>
      )}
      {model.closed && model.session.data ? (
        <div className="space-y-3 rounded-2xl border bg-secondary p-4">
          <h3 className="text-lg font-semibold">
            {m.closedTitle(sessionTitle(model.session.data, language))}
          </h3>
          <p>
            {m.closedSummary(
              closeLabel(language, model.session.data.closeReason!, model.session.data.channel),
              formatMoney(model.session.data.totalAmountCents, language),
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {model.session.data.online ? m.online.closedHint : m.closedHint}
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
          {kind && (
            <Button
              size="lg"
              className="w-full"
              disabled={!model.fresh || locked}
              onClick={() => confirm(kind)}
            >
              {kind === "PAID" && bill?.channel === "DELIVERY"
                ? m.online.deliveredButton
                : kind === "PAID" && bill?.online
                  ? m.online.paidButton
                  : m.closeButton[kind]}
            </Button>
          )}
          {bill && noShowAllowed(bill, account.role) && (
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              disabled={!model.fresh || locked}
              onClick={() => confirm("NO_SHOW")}
            >
              {bill.channel === "DELIVERY" ? m.online.notDeliveredButton : m.closeButton.NO_SHOW}
            </Button>
          )}
          {bill && canEditDeliveryFee(bill, account.role) && (
            <Button
              variant="outline"
              className="w-full"
              disabled={!model.fresh || locked}
              onClick={editFee}
            >
              {m.online.editFee}
            </Button>
          )}
          {bill &&
            !kind &&
            bill.newItemCount === 0 &&
            account.role === "STAFF" &&
            bill.totalAmountCents > 0 && (
              <p className="text-sm text-muted-foreground">{m.ownerCollects}</p>
            )}
          <BillDetails model={model} />
          <ConfirmDialog
            open={!!confirmation}
            title={
              confirmation ? `${copy.title} · ${sessionTitle(confirmation.bill, language)}` : ""
            }
            description={copy.description}
            confirmLabel={copy.label}
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
                {confirmation.bill.deliveryFeeCents !== null &&
                  billAmounts(confirmation.bill).feeCounted && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {m.online.confirmFee(
                        formatMoney(confirmation.bill.deliveryFeeCents, language),
                      )}
                    </p>
                  )}
                {/* The till issues the receipt, so staff repeat the discount there. */}
                {confirmation.bill.online?.coupon &&
                  confirmation.bill.online.coupon.discountCents > 0 && (
                    <p className="text-sm text-muted-foreground tabular-nums wrap-break-word">
                      {m.online.confirmCoupon(
                        confirmation.bill.online.coupon.code,
                        formatMoney(confirmation.bill.online.coupon.discountCents, language),
                      )}
                    </p>
                  )}
                {changed && <Notice tone="error">{m.changed}</Notice>}
                <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 font-medium">
                  <Checkbox
                    ref={checkbox}
                    checked={checked}
                    disabled={locked || changed}
                    onCheckedChange={setChecked}
                  />
                  {copy.checked}
                </label>
              </div>
            )}
          </ConfirmDialog>
          <ConfirmDialog
            open={!!feeEdit}
            title={feeEdit ? `${m.online.editFee} · ${sessionTitle(feeEdit.bill, language)}` : ""}
            description={m.online.editFeeHint}
            confirmLabel={m.online.saveFee}
            cancelLabel={m.backToBill}
            busy={fees.busy}
            confirmDisabled={
              fee === null ||
              fee === feeEdit?.bill.deliveryFeeCents ||
              feeChanged ||
              locked ||
              !model.fresh
            }
            initialFocus={feeInput}
            onConfirm={() => void saveFee()}
            onCancel={() => setFeeEdit(null)}
          >
            {feeEdit && (
              <div className="space-y-2">
                {feeChanged && <Notice tone="error">{m.changed}</Notice>}
                <Label htmlFor="delivery-fee-edit">{m.online.feeLabel}</Label>
                <Input
                  id="delivery-fee-edit"
                  ref={feeInput}
                  inputMode="decimal"
                  autoComplete="off"
                  value={feeEdit.text}
                  disabled={locked || feeChanged}
                  aria-invalid={fee === null}
                  aria-describedby="delivery-fee-edit-hint"
                  onChange={(event) => setFeeEdit({ ...feeEdit, text: event.target.value })}
                />
                <p
                  id="delivery-fee-edit-hint"
                  className={cn(
                    "text-sm",
                    fee === null ? "text-destructive" : "font-semibold tabular-nums",
                  )}
                >
                  {fee === null
                    ? m.online.feeInvalid
                    : m.online.newTotal(formatMoney(totalWithFee(feeEdit.bill, fee), language))}
                </p>
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
