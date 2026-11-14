import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { SourceLink } from "@/components/source-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatMoney, formatTime } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { messages as menuMessages } from "@/features/public-menu/messages";
import { onlineOrderQuery, type OnlineOrder } from "./api";
import { onlineOrderMessages } from "./messages";
import { OnlineHeader, PhoneLink } from "./OnlineViews";
import { useRestaurantLanguage } from "./useRestaurantLanguage";
import { orderEnded, orderView, statusCopy } from "./state";

function headline(order: OnlineOrder, language: Language) {
  const m = onlineOrderMessages[language];
  const copy = statusCopy(order);
  if (order.estimatedAt && copy === "preparingPickup")
    return m.preparingPickupAt(formatTime(order.estimatedAt, language));
  if (order.estimatedAt && copy === "preparingDelivery")
    return m.preparingDeliveryAt(formatTime(order.estimatedAt, language));
  return m.status[copy];
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
  const m = onlineOrderMessages[language];
  const view = orderView(order);
  const ended = orderEnded(order);
  const phone = order.restaurant.publicPhone;
  // When the order did not go ahead, calling the restaurant is the customer's next step.
  const callFirst = view === "expired" || view === "rejected" || view === "allCancelled";
  const success = view === "ready" || view === "collected";
  // Before acceptance a delivery order has no fee yet: the restaurant confirms it when accepting.
  const itemsOnly = order.fulfillment === "DELIVERY" && order.phase !== "ACCEPTED";
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
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{m.orderTitle}</h2>
              <p className="font-display text-3xl font-semibold tabular-nums">
                {m.orderNumber(order.number)}
              </p>
            </div>
            <p
              role="status"
              className={cn(
                "text-xl leading-snug font-semibold",
                success && "text-success-foreground",
              )}
            >
              {headline(order, language)}
            </p>
            {order.customerName && (
              <p className="text-muted-foreground wrap-break-word">
                {(order.fulfillment === "DELIVERY" ? m.deliveryFor : m.pickupFor)(
                  order.customerName,
                )}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{m.submitted}</dt>
              <dd className="tabular-nums">{formatTime(order.submittedAt, language)}</dd>
              {order.estimatedAt && !ended && (
                <>
                  <dt className="text-muted-foreground">{m.estimated}</dt>
                  <dd className="tabular-nums">{formatTime(order.estimatedAt, language)}</dd>
                </>
              )}
            </dl>
            {view === "waiting" && (
              <p className="text-sm leading-6">
                {m.waitingHint(formatTime(order.expiresAt, language))} {m.updating}
              </p>
            )}
          </CardContent>
        </Card>
        {callFirst && phone && (
          <Notice tone="warning" action={<PhoneLink phone={phone} language={language} />}>
            {m.status[statusCopy(order)]}
          </Notice>
        )}
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
                {formatMoney(order.deliveryFeeCents, language)}
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
        <footer className="border-t pt-5">
          <SourceLink label={menuMessages[language].sourceCode} />
        </footer>
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
      <SourceLink label={menuMessages[language].sourceCode} />
    </main>
  );
}
