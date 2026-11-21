import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChefHat, Clock, RefreshCw, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_NAME } from "@/lib/brand";
import { pickupMessages } from "@/features/online/pickup-messages";
import { formatMoney, formatPickupDateTime, formatTime } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { onlineOrderQuery, type OnlineOrder } from "./api";
import { onlineOrderMessages } from "./messages";
import { OnlineHeader, PhoneLink } from "./OnlineViews";
import { useRestaurantLanguage } from "./useRestaurantLanguage";
import {
  orderEnded,
  orderProgress,
  orderView,
  statusCopy,
  type OrderStep,
  type OrderView,
} from "./state";

// Each state's icon on a round badge. State colours keep one meaning in every theme; an accepted
// order in preparation takes the restaurant's own accent.
const failed = { Icon: X, className: "bg-destructive/10 text-destructive" };
const done = { Icon: Check, className: "bg-success text-success-foreground" };
const viewIcons: Record<OrderView, { Icon: LucideIcon; className: string }> = {
  waiting: { Icon: Clock, className: "bg-warning text-warning-foreground" },
  scheduled: { Icon: Clock, className: "bg-accent text-accent-foreground" },
  preparing: { Icon: ChefHat, className: "bg-accent text-accent-foreground" },
  ready: done,
  collected: done,
  closed: { Icon: X, className: "bg-muted text-muted-foreground" },
  expired: failed,
  rejected: failed,
  allCancelled: failed,
};

// The steps of an order going ahead. Steps behind take the restaurant's colour; the current one takes
// its state's colour, with the same meaning as the badge above. Step 3 is past the last one: done.
const currentStep = [
  "bg-warning text-warning-foreground",
  "bg-accent text-accent-foreground ring-2 ring-primary",
  "bg-success text-success-foreground",
];
const stepIcons: LucideIcon[] = [Clock, ChefHat, Check];

function OrderProgress({
  step,
  delivery,
  language,
}: {
  step: OrderStep;
  delivery: boolean;
  language: Language;
}) {
  const m = onlineOrderMessages[language].progress;
  const labels = [m.sent, m.accepted, delivery ? m.readyDelivery : m.readyPickup];
  return (
    <ol aria-label={onlineOrderMessages[language].progressLabel} className="grid grid-cols-3 pt-1">
      {labels.map((label, index) => {
        const Icon = index < step ? Check : stepIcons[index];
        return (
          <li
            key={index}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              // The line from the previous step's centre to this one; the dots (z-10) paint over its
              // ends, also over the next step's line, which comes later in the page.
              "relative flex min-w-0 flex-col items-center gap-1.5 text-center text-xs leading-4 before:absolute before:top-3.5 before:right-1/2 before:-left-1/2 before:h-0.5 before:-translate-y-1/2 first:before:hidden",
              index <= step ? "before:bg-primary" : "before:bg-border",
            )}
          >
            <span
              className={cn(
                "relative z-10 flex size-7 items-center justify-center rounded-full",
                index < step
                  ? "bg-primary text-primary-foreground"
                  : index === step
                    ? currentStep[index]
                    : "border bg-card text-muted-foreground",
              )}
            >
              {index > step ? (
                <span className="font-medium tabular-nums">{index + 1}</span>
              ) : (
                <Icon aria-hidden="true" className="size-4" />
              )}
            </span>
            <span className={index > step ? "text-muted-foreground" : "font-medium"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderContent({
  order,
  error,
  refreshing,
  refresh,
}: {
  order: OnlineOrder;
  error: boolean;
  refreshing: boolean;
  refresh: () => void;
}) {
  const [language, selectLanguage] = useRestaurantLanguage(
    order.restaurant.id,
    order.restaurant.defaultLanguage,
  );
  useDocumentTheme(order.restaurant.theme);
  const [copied, setCopied] = useState<boolean | null>(null);
  const m = onlineOrderMessages[language];
  const view = orderView(order);
  const step = orderProgress(view);
  const ended = orderEnded(order);
  const phone = order.restaurant.publicPhone;
  // When the order did not go ahead, calling the restaurant is the customer's next step.
  const callFirst = view === "expired" || view === "rejected" || view === "allCancelled";
  const success = view === "ready" || view === "collected";
  const delivery = order.fulfillment === "DELIVERY";
  const { Icon, className: iconClass } = viewIcons[view];
  const copy = statusCopy(order);
  const reason = m.statusReason[copy];
  // While the order is prepared, the estimated time is the one thing to remember: it stands alone.
  const pickup = pickupMessages[language];
  const reservationTime = order.requestedPickupAt;
  const estimate =
    !reservationTime && view === "preparing" && order.estimatedAt
      ? formatTime(order.estimatedAt, language)
      : null;
  let reservationStatus: string | null = null;
  if (reservationTime && view === "preparing")
    reservationStatus = order.pickupTimeReached ? pickup.delayed : pickup.preparing;
  if (reservationTime && order.closeReason === "VOIDED") reservationStatus = pickup.cancelled;

  async function copyOrderLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  // A delivery without an automatic quote has no fee until the restaurant confirms it on acceptance.
  const itemsOnly = delivery && order.deliveryFeeCents === null;
  const feePending = itemsOnly && order.phase === "WAITING";
  return (
    <div lang={language} className="min-h-dvh">
      <OnlineHeader
        name={order.restaurant.name}
        phone={callFirst ? null : phone}
        language={language}
        selectLanguage={selectLanguage}
        action={
          ended ? undefined : (
            <Button
              variant="outline"
              size="icon"
              aria-label={m.refresh}
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
          )
        }
      />
      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5 pb-12">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="sr-only">{m.orderTitle}</h2>
            <div className="flex items-start justify-between gap-3">
              <div role="status" className="min-w-0 flex-1 space-y-3">
                <p className="flex items-start gap-3 text-xl leading-snug font-semibold">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      iconClass,
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className={cn("min-w-0 pt-1 wrap-break-word", success && "text-success")}>
                    {reservationStatus ?? (estimate ? m.accepted : m.status[copy])}
                  </span>
                </p>
                {/* A short headline, then why, aligned with the headline's text. */}
                {reason && <p className="pl-12 leading-6 text-muted-foreground">{reason}</p>}
                {reservationTime && (
                  <p className="font-display text-xl font-semibold tabular-nums">
                    {pickup.appointment(formatPickupDateTime(reservationTime, language))}
                  </p>
                )}
                {estimate && (
                  <div>
                    <p className="font-display text-5xl font-semibold tabular-nums">{estimate}</p>
                    <p className="mt-1 text-muted-foreground">
                      {delivery ? m.deliveryAround : m.pickupAround}
                    </p>
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{m.numberLabel}</p>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {m.orderNumber(order.number)}
                </p>
              </div>
            </div>
            {/* Outside the status region, so a step change is announced once, by the status text. */}
            {step !== null && <OrderProgress step={step} delivery={delivery} language={language} />}
            {view === "waiting" && (
              <p className="text-sm leading-6">
                {/* Chinese sentences follow each other without a space. */}
                {[m.waitingHint(formatTime(order.expiresAt, language)), m.updating].join(
                  language === "zh" ? "" : " ",
                )}
              </p>
            )}
            {/* When the order did not go ahead, calling is the next step: the phone moves here. */}
            {callFirst && phone && (
              <PhoneLink phone={phone} language={language} className="w-full" />
            )}
            {reservationTime && (
              <>
                <Button variant="outline" onClick={() => void copyOrderLink()}>
                  {pickup.copy}
                </Button>
                {copied !== null && (
                  <Notice tone={copied ? "success" : "warning"}>
                    {copied ? pickup.copied : pickup.copyFailed}
                  </Notice>
                )}
              </>
            )}
            <p className="border-t pt-3 text-sm text-muted-foreground wrap-break-word">
              {order.customerName &&
                `${(delivery ? m.deliveryFor : m.pickupFor)(order.customerName)} · `}
              {m.submittedAt(formatTime(order.submittedAt, language))}
            </p>
          </CardContent>
        </Card>
        {error && (
          <Notice
            tone="error"
            action={
              <Button variant="outline" disabled={refreshing} onClick={refresh}>
                <RefreshCw />
                {m.retry}
              </Button>
            }
          >
            {m.orderStale}
          </Notice>
        )}
        <section aria-labelledby="order-items" className="space-y-3">
          <h2 id="order-items" className="font-semibold">
            {m.items}
          </h2>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {order.items.map((item, index) => {
              const name = displayName(item, order.restaurant.defaultLanguage, language);
              const cancelled = item.status === "CANCELLED";
              return (
                <li
                  key={index}
                  className={cn("space-y-1 py-3", cancelled && "text-muted-foreground")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p lang={name.language} className="min-w-0 font-medium wrap-break-word">
                      {item.quantity} × {name.text}
                    </p>
                    <span className={cn("shrink-0 tabular-nums", cancelled && "line-through")}>
                      {formatMoney(item.unitPriceCents * item.quantity, language)}
                    </span>
                  </div>
                  {item.options.length > 0 && (
                    <p className="text-sm text-muted-foreground wrap-break-word">
                      {optionSummary(item.options, order.restaurant.defaultLanguage, language)}
                    </p>
                  )}
                  {item.remark && (
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                      {m.remark}: {item.remark}
                    </p>
                  )}
                  {cancelled && (
                    <Badge variant="outline">
                      {m.cancelled} · {m.notCharged}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {/* The total already takes the coupon off the dishes still charged. */}
          {order.coupon && order.coupon.discountCents > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 wrap-break-word">
                {m.couponApplied(order.coupon.code, order.coupon.percentOff)}
              </span>
              <span className="shrink-0 tabular-nums">
                −{formatMoney(order.coupon.discountCents, language)}
              </span>
            </div>
          )}
          {order.deliveryFeeCents !== null && (
            <div className="flex items-baseline justify-between gap-3">
              <span>{m.deliveryFee}</span>
              {/* With every dish cancelled the fee is not charged either. */}
              <span
                className={cn(
                  "tabular-nums",
                  view === "allCancelled" && "text-muted-foreground line-through",
                )}
              >
                {order.deliveryFeeCents === 0
                  ? m.free
                  : formatMoney(order.deliveryFeeCents, language)}
              </span>
            </div>
          )}
          {order.deliveryFeeCents !== null && view === "allCancelled" && (
            <Badge variant="outline">{m.notCharged}</Badge>
          )}
          <p className="flex items-baseline justify-between gap-3 text-lg font-semibold">
            <span>{itemsOnly ? m.itemsTotal : m.total}</span>
            <span className="tabular-nums">{formatMoney(order.totalAmountCents, language)}</span>
          </p>
          {feePending && <p className="text-sm text-muted-foreground">{m.feePending}</p>}
        </section>
        {!ended && <p className="text-sm text-muted-foreground">{m.cannotCancel}</p>}
        {order.restaurant.slug && (
          <Link
            to="/r/$slug"
            params={{ slug: order.restaurant.slug }}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {m.backToMenu}
          </Link>
        )}
      </main>
    </div>
  );
}

// The customer's status page, opened from the secret link the submission returned.
export function OnlineOrderPage({ token }: { token: string }) {
  const query = useQuery(onlineOrderQuery(token));
  const [language, setLanguage] = useState<Language>("it");
  if (query.data)
    return (
      <OrderContent
        order={query.data}
        error={query.isError || query.fetchStatus === "paused"}
        refreshing={query.isFetching}
        refresh={() => void query.refetch()}
      />
    );
  const m = onlineOrderMessages[language];
  const failed = query.isError || query.fetchStatus === "paused";
  return (
    <main
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10"
    >
      <BrandMark />
      <h1 className="sr-only">
        {PRODUCT_NAME} · {m.orderTitle}
      </h1>
      <LanguageToggle language={language} select={setLanguage} />
      <Notice tone={query.data === null || failed ? "error" : "info"}>
        {query.data === null ? m.ended : failed ? m.orderError : m.loading}
      </Notice>
      {query.data !== null && (
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw />
          {m.retry}
        </Button>
      )}
    </main>
  );
}
