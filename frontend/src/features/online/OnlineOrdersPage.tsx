import { useEffect, useState } from "react";
import { RefreshCw, ShoppingBag } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { closeOrderNotifications } from "@/features/push/device";
import { formatKm, formatMoney, formatPickupDateTime, formatTime } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { formatPhone } from "@/lib/phone";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { OnlineActiveOrder, OnlinePendingPage, OnlinePendingRequest } from "./api";
import { ContactActions, DeliveryAddress } from "./DeliveryAddress";
import { pickupMessages } from "./pickup-messages";
import { onlineOrdersMessages } from "./messages";
import {
  activeProgress,
  deliveryFeeForTier,
  DELIVERY_MINUTES,
  formatCountdown,
  PICKUP_MINUTES,
  rejectReasons,
  requestTimes,
  type DeliveryTier,
  type RejectReason,
} from "./state";
import { useOnlineOrders } from "./useOnlineOrders";

type Model = ReturnType<typeof useOnlineOrders>;

const progressBadges = { preparing: "warning", ready: "success", cancelled: "outline" } as const;

// Less than this left: the countdown turns red, so someone decides before the request expires.
const URGENT_SECONDS = 180;

// An amount that never wraps between the euro sign and the digits inside a longer line.
const amount = (cents: number, language: Language) =>
  formatMoney(cents, language).replace(" ", "\u00a0");

function PendingCard({
  request,
  page,
  model,
  onReject,
}: {
  request: OnlinePendingRequest;
  page: OnlinePendingPage;
  model: Model;
  onReject: (request: OnlinePendingRequest) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const c = staffMessages[language];
  const times = requestTimes(request, page.now, page.receivedAt, model.view.now);
  const disabled = !model.fresh || !!model.busy || times.remainingSeconds === 0;
  const delivery = request.fulfillment === "DELIVERY";
  const pickup = pickupMessages[language];
  const reservation = request.requestedPickupAt;
  const serverNow = Date.parse(page.now) + Math.max(0, model.view.now - page.receivedAt);
  const minutesFit = (minutes: number) =>
    !reservation ||
    (request.availablePreparationMinutes?.includes(minutes) &&
      Date.parse(reservation) - minutes * 60_000 >= serverNow);
  // Delivery is accepted with one of the restaurant's current fee bands, picked by the road distance
  // on the route from the restaurant. A band edited or removed meanwhile is no longer picked, so a
  // new fee is never sent without being chosen again.
  const tiers = page.delivery?.tiers ?? [];
  const origin =
    page.delivery?.originLat != null && page.delivery.originLng != null
      ? { lat: page.delivery.originLat, lng: page.delivery.originLng }
      : null;
  const [picked, setPicked] = useState<DeliveryTier | null>(null);
  // A fee quoted to the customer is kept as it is; acceptance sends none.
  const quoted = request.deliveryFeeCents;
  const tier = tiers.find(
    (t) =>
      t.maxMeters === picked?.maxMeters &&
      t.feeCents === picked.feeCents &&
      t.freeDeliveryMinCents === picked.freeDeliveryMinCents,
  );
  const discount = request.coupon?.discountCents ?? 0;
  const due = request.itemsTotalCents - discount;
  const fee = quoted ?? (tier ? deliveryFeeForTier(tier, due) : null);
  const tierLabelId = `delivery-tier-${request.id}`;
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-2xl font-bold">
            <span className="tabular-nums">#{request.number}</span>
            <Badge variant="secondary">{m.fulfillment[request.fulfillment]}</Badge>
          </h3>
          {request.customerName && (
            <p className="text-lg font-medium wrap-break-word">{request.customerName}</p>
          )}
          {request.customerPhone && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatPhone(request.customerPhone)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="text-muted-foreground">{m.waited(times.waitedMinutes)}</p>
          <p
            className={cn(
              "font-semibold tabular-nums",
              times.remainingSeconds < URGENT_SECONDS && "text-destructive",
            )}
          >
            {m.remaining(formatCountdown(times.remainingSeconds))}
          </p>
        </div>
      </header>
      {reservation && (
        <p className="text-base font-semibold tabular-nums">
          {pickup.appointment(formatPickupDateTime(reservation, language))}
        </p>
      )}
      {delivery && request.deliveryAddress && (
        <DeliveryAddress address={request.deliveryAddress} notes={request.deliveryNotes} />
      )}
      <ContactActions
        phone={request.customerPhone}
        address={delivery ? request.deliveryAddress : null}
        origin={origin}
      />
      <ul className="divide-y border-y">
        {request.items.map((line, index) => {
          const name = displayName(line, request.defaultLanguage, language);
          return (
            <li key={index} className="space-y-1 py-2">
              <div className="flex items-start justify-between gap-3">
                <p lang={name.language} className="min-w-0 font-medium wrap-break-word">
                  {line.quantity} × {name.text}
                </p>
                <p className="shrink-0 tabular-nums">
                  {formatMoney(line.unitPriceCents * line.quantity, language)}
                </p>
              </div>
              {line.options.length > 0 && (
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {optionSummary(line.options, request.defaultLanguage, language)}
                </p>
              )}
              {line.remark && (
                <p className="rounded-lg bg-warning/20 px-2.5 py-1.5 text-sm whitespace-pre-wrap wrap-break-word">
                  {c.remark(line.remark)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 text-right tabular-nums">
        <p className="font-semibold">
          {m.subtotal(formatMoney(request.itemsTotalCents, language))}
        </p>
        {request.coupon && (
          <>
            <p className="text-sm wrap-break-word">
              {m.coupon(
                request.coupon.code,
                request.coupon.percentOff,
                formatMoney(discount, language),
              )}
            </p>
            {!delivery && (
              <p className="font-semibold">{m.toCollect(formatMoney(due, language))}</p>
            )}
          </>
        )}
      </div>
      <div className="space-y-2">
        {delivery && (
          <div className="space-y-2">
            {quoted !== null ? (
              <p className="text-sm font-medium">
                {m.quotedFee(
                  quoted === 0 ? m.free : amount(quoted, language),
                  formatKm(request.deliveryDistanceMeters ?? 0, language),
                )}
              </p>
            ) : (
              <p id={tierLabelId} className="text-sm font-medium">
                {m.tierChoice}
              </p>
            )}
            {quoted !== null ? null : tiers.length === 0 ? (
              <Notice tone="warning">{m.noTiers}</Notice>
            ) : (
              // Compact cells, three to a row on phones: up to five bands fit in two rows. The
              // radio covers its cell, so the whole cell is the target; the picked one is filled.
              <RadioGroup
                aria-labelledby={tierLabelId}
                value={tier ? String(tier.maxMeters) : ""}
                disabled={disabled}
                onValueChange={(value) =>
                  setPicked(tiers.find((t) => String(t.maxMeters) === value) ?? null)
                }
                className="grid-cols-3 sm:grid-cols-5"
              >
                {tiers.map((tier) => {
                  const bandFee = deliveryFeeForTier(tier, due);
                  return (
                    <label
                      key={tier.maxMeters}
                      className="relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl border px-1 py-2 text-center text-sm font-medium tabular-nums transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:border-primary has-data-checked:bg-accent has-data-checked:text-accent-foreground has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50"
                    >
                      <RadioGroupItem
                        value={String(tier.maxMeters)}
                        className="absolute inset-0 size-auto aspect-auto rounded-xl border-0 opacity-0"
                      />
                      <span className="min-w-0 wrap-break-word">
                        {m.tierDistance(formatKm(tier.maxMeters, language))}
                      </span>
                      <span className="min-w-0">
                        {bandFee === 0 ? m.free : amount(bandFee, language)}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
            {fee !== null && (
              <p className="rounded-xl bg-secondary px-3 py-2 text-sm font-semibold tabular-nums">
                {request.coupon
                  ? m.deliveryTotalWithCoupon(
                      amount(request.itemsTotalCents, language),
                      amount(discount, language),
                      amount(fee, language),
                      amount(due + fee, language),
                    )
                  : m.deliveryTotal(
                      amount(request.itemsTotalCents, language),
                      amount(fee, language),
                      amount(request.itemsTotalCents + fee, language),
                    )}
              </p>
            )}
          </div>
        )}
        {model.notice?.requestId === request.id && (
          <Notice tone={model.notice.tone}>{model.notice.text}</Notice>
        )}
        {/* The times stay disabled until a band is picked: say so where they are. */}
        <p className="text-sm font-medium">
          {!delivery
            ? reservation
              ? pickup.prepChoice
              : m.acceptWith
            : quoted === null && tiers.length > 0 && fee === null
              ? m.acceptAfterBand
              : m.acceptWithDelivery}
        </p>
        {reservation && !PICKUP_MINUTES.some(minutesFit) && (
          <Notice tone="warning">{pickup.noPrepOptions}</Notice>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(delivery ? DELIVERY_MINUTES : PICKUP_MINUTES).map((minutes) => (
            <Button
              key={minutes}
              size="lg"
              disabled={disabled || !minutesFit(minutes) || (delivery && fee === null)}
              aria-label={
                delivery
                  ? m.acceptDeliveryLabel(request.number, minutes)
                  : reservation
                    ? pickup.prepLabel(minutes)
                    : m.acceptLabel(request.number, minutes)
              }
              onClick={async () => {
                const manual = delivery && quoted === null;
                const accepted = await model.accept(
                  request,
                  minutes,
                  manual ? fee : null,
                  manual ? (tier?.maxMeters ?? null) : null,
                );
                if (!accepted) setPicked(null);
              }}
            >
              {m.minutes(minutes)}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full text-destructive"
          disabled={disabled}
          onClick={() => onReject(request)}
        >
          {m.reject}
        </Button>
      </div>
    </article>
  );
}

// Read only: the one place STAFF find an accepted customer's phone, since the kitchen and pass never
// show it and STAFF have no bills page.
function ActiveCard({
  order,
  disabled,
  onCancel,
}: {
  order: OnlineActiveOrder;
  disabled: boolean;
  onCancel: () => void;
}) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const progress = activeProgress(order);
  const pickup = pickupMessages[language];
  return (
    <article className="min-w-0 space-y-2 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xl font-bold">
            <span className="tabular-nums">#{order.number}</span>
            <Badge variant="secondary">{m.fulfillment[order.channel]}</Badge>
          </h3>
          {order.customerName && (
            <p className="font-medium wrap-break-word">{order.customerName}</p>
          )}
          {order.customerPhone && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatPhone(order.customerPhone)}
            </p>
          )}
        </div>
        {order.awaitingPreparation ? (
          <Badge variant="secondary">{pickup.title}</Badge>
        ) : (
          <Badge variant={progressBadges[progress]}>{m.progress[progress]}</Badge>
        )}
      </header>
      {order.requestedPickupAt ? (
        <p className="font-semibold tabular-nums">
          {pickup.appointment(formatPickupDateTime(order.requestedPickupAt, language))}
        </p>
      ) : (
        <p className="text-sm">{m.estimated(formatTime(order.estimatedAt, language))}</p>
      )}
      {order.awaitingPreparation && order.kitchenStartsAt && (
        <p className="text-sm tabular-nums">
          {pickup.entersKitchen(formatTime(order.kitchenStartsAt, language))}
        </p>
      )}
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold tabular-nums">
          {m.toCollect(formatMoney(order.totalAmountCents, language))}
        </span>
        {order.deliveryFeeCents !== null && progress !== "cancelled" && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {m.feeIncluded(formatMoney(order.deliveryFeeCents, language))}
          </span>
        )}
      </p>
      {order.coupon && progress !== "cancelled" && (
        <p className="text-sm text-muted-foreground wrap-break-word">
          {m.couponIncluded(order.coupon.code, order.coupon.percentOff)}
        </p>
      )}
      {order.channel === "DELIVERY" && order.deliveryAddress && (
        <DeliveryAddress address={order.deliveryAddress} notes={order.deliveryNotes} />
      )}
      <ContactActions
        phone={order.customerPhone}
        address={order.channel === "DELIVERY" ? order.deliveryAddress : null}
      />
      {order.awaitingPreparation && (
        <Button
          variant="outline"
          className="text-destructive"
          disabled={disabled}
          onClick={onCancel}
        >
          {pickup.cancel}
        </Button>
      )}
    </article>
  );
}

function OnlineOrdersContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const pickup = pickupMessages[language];
  const model = useOnlineOrders(account);
  const [cancelling, setCancelling] = useState<OnlineActiveOrder | null>(null);
  const [rejecting, setRejecting] = useState<OnlinePendingRequest | null>(null);
  const [reason, setReason] = useState<RejectReason | null>(null);
  const page = model.pending.data;
  const active = [...(model.active.data?.items ?? [])].sort((a, b) => {
    if (!a.awaitingPreparation || !b.awaitingPreparation)
      return Number(!!a.awaitingPreparation) - Number(!!b.awaitingPreparation);
    return Date.parse(a.estimatedAt) - Date.parse(b.estimatedAt);
  });
  const fetching = model.pending.isFetching || model.active.isFetching;
  const cancelAvailable = active.some(
    (order) => order.sessionId === cancelling?.sessionId && order.awaitingPreparation,
  );
  const cancelNotice =
    cancelling && model.notice?.requestId === cancelling.sessionId ? model.notice : null;
  // Opening the page, or returning to it, answers the lock-screen notifications on this device.
  useEffect(() => {
    if (model.view.active) void closeOrderNotifications().catch(() => undefined);
  }, [model.view.active]);
  async function reject() {
    if (!rejecting) return;
    await model.reject(rejecting, reason);
    setRejecting(null);
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
            disabled={!model.view.active || fetching}
            onClick={model.refresh}
          >
            <RefreshCw className={cn(fetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-3">
        {model.notice && !model.notice.requestId && (
          <Notice tone={model.notice.tone}>{model.notice.text}</Notice>
        )}
        {(model.pending.isError || model.active.isError) && (
          <Notice tone="error">{m.readError}</Notice>
        )}
        {model.stalled && !model.pending.isError && <Notice tone="warning">{m.stale}</Notice>}
      </div>
      <section aria-labelledby="online-pending" className="mt-4 space-y-3">
        <h2 id="online-pending" className="text-lg font-semibold">
          {m.pendingTitle(page?.items.length ?? 0)}
        </h2>
        {!page && model.pending.isPending && <LoadingState label={m.loading} />}
        {page && page.items.length === 0 && (
          <EmptyState icon={ShoppingBag} title={m.noPending} description={m.noPendingHint} />
        )}
        {page?.items.map((request) => (
          <PendingCard
            key={request.id}
            request={request}
            page={page}
            model={model}
            onReject={(target) => {
              setReason(null);
              setRejecting(target);
            }}
          />
        ))}
      </section>
      <section aria-labelledby="online-active" className="mt-8 space-y-3">
        <h2 id="online-active" className="text-lg font-semibold">
          {m.activeTitle(active.length)}
        </h2>
        {model.active.data && active.length === 0 && (
          <p className="text-sm leading-6 text-muted-foreground">
            {m.noActive} · {m.noActiveHint}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((order) => (
            <ActiveCard
              key={order.sessionId}
              order={order}
              disabled={!model.activeFresh || !!model.busy}
              onCancel={() => {
                model.clearNotice();
                setCancelling(order);
              }}
            />
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={!!cancelling}
        tone="destructive"
        title={cancelling ? `${pickup.cancel} #${cancelling.number}` : pickup.cancel}
        description={cancelAvailable && !cancelNotice ? pickup.cancelHint : undefined}
        confirmLabel={cancelAvailable ? pickup.cancel : undefined}
        cancelLabel={cancelNotice || !cancelAvailable ? staffMessages[language].close : undefined}
        busy={!!cancelling && model.busy === cancelling.sessionId}
        confirmDisabled={!model.activeFresh || model.active.isFetching || !!model.busy}
        onConfirm={async () => {
          if (cancelling && (await model.cancelPickup(cancelling.sessionId))) setCancelling(null);
        }}
        onCancel={() => {
          if (cancelNotice) model.clearNotice();
          setCancelling(null);
        }}
      >
        {cancelNotice && <Notice tone={cancelNotice.tone}>{cancelNotice.text}</Notice>}
        {!cancelAvailable && !cancelNotice && (
          <Notice tone="warning">{pickup.cancelUnavailable}</Notice>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!rejecting}
        tone="destructive"
        title={rejecting ? m.rejectTitle(rejecting.number) : ""}
        description={m.rejectHint}
        confirmLabel={m.rejectConfirm}
        busy={!!rejecting && model.busy === rejecting.id}
        confirmDisabled={!model.fresh || !!model.busy}
        onConfirm={() => void reject()}
        onCancel={() => setRejecting(null)}
      >
        <RadioGroup
          value={reason ?? "NONE"}
          onValueChange={(value) => setReason(value === "NONE" ? null : (value as RejectReason))}
          aria-label={m.rejectHint}
        >
          {(["NONE", ...rejectReasons(rejecting?.fulfillment ?? "PICKUP")] as const).map(
            (value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
              >
                <RadioGroupItem value={value} />
                {value === "NONE" ? m.noReason : m.reasons[value]}
              </label>
            ),
          )}
        </RadioGroup>
      </ConfirmDialog>
    </div>
  );
}

export function OnlineOrdersPage() {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.services.online ? (
          <OnlineOrdersContent
            key={`${account.restaurantId}:${account.userId}`}
            account={account}
          />
        ) : (
          <ServiceNotOffered messages={onlineOrdersMessages} backToHome />
        )
      }
    </AuthBoundary>
  );
}
