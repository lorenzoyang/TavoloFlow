import { useEffect, useRef, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice, type NoticeTone } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayName, type Language } from "@/lib/language";
import { allergenNames } from "@/features/public-menu/messages";
import type { PublicMenu } from "@/features/public-menu/api";
import type { useGuestVisit } from "@/features/guests/useGuestVisit";
import { accessOutcome } from "@/features/guests/state";
import { ApiError } from "@/lib/api";
import { cn, uniqueBy } from "@/lib/utils";
import { ordersKey, readOrders, type Order, type OrderItemStatus } from "./api";
import { orderMessages, type OrderMessage } from "./messages";
import { totalCents, type CartLine } from "./state";
import type { MenuItem } from "@/features/menu/api";
import type { useCart } from "./useCart";
import { formatDateTime, formatMoney, formatTime, shortId } from "@/lib/format";

type Guest = ReturnType<typeof useGuestVisit>;

const statusBadge = {
  NEW: "secondary",
  READY: "success",
  CANCELLED: "outline",
} as const satisfies Record<OrderItemStatus, "secondary" | "success" | "outline">;

// Success is the only good news; menu changes and pauses are recoverable, never alarming errors.
const messageTone = (message: OrderMessage): NoticeTone =>
  message === "success" ? "success" : message === "unverified" ? "info" : "warning";

function OrderCard({ order, language }: { order: Order; language: Language }) {
  const m = orderMessages[language];
  const cancelled = order.items.every((line) => line.status === "CANCELLED");
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium tabular-nums">{formatTime(order.createdAt, language)}</p>
          <p className="text-xs text-muted-foreground">#{shortId(order.id)}</p>
        </div>
        <Badge variant={order.status === "NEW" ? "secondary" : cancelled ? "outline" : "success"}>
          {m[order.status]}
        </Badge>
      </header>
      <ul className="divide-y">
        {order.items.map((line) => {
          const name = displayName(line, order.defaultLanguage, language);
          return (
            <li
              key={line.id}
              className={cn(
                "space-y-1 py-2.5",
                line.status === "CANCELLED" && "text-muted-foreground",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p lang={name.language} className="min-w-0 font-medium wrap-break-word">
                  {line.itemCode && (
                    <span className="mr-2 text-xs text-muted-foreground">{line.itemCode}</span>
                  )}
                  {line.quantity} × {name.text}
                </p>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    line.status === "CANCELLED" && "line-through",
                  )}
                >
                  {formatMoney(line.unitPriceCents * line.quantity, language)}
                </span>
              </div>
              <Badge variant={statusBadge[line.status]}>
                {m[line.status]}
                {line.status === "CANCELLED" && ` · ${m.notCharged}`}
              </Badge>
              {line.remark && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                  {m.remark}: {line.remark}
                </p>
              )}
              {line.allergenCodes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {m.allergies}:{" "}
                  {line.allergenCodes.map((c) => allergenNames[language][c] ?? c).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {order.payableAmountCents !== order.totalAmountCents && (
        <p className="text-right text-sm text-muted-foreground">
          {m.originalTotal}: {formatMoney(order.totalAmountCents, language)}
        </p>
      )}
      <p className="text-right font-semibold tabular-nums">
        {m.payable}: {formatMoney(order.payableAmountCents, language)}
      </p>
    </article>
  );
}

// The cart lines with quantity, remark and removal controls, or read-only while a submission is reviewed.
// Shared by the table cart and the online pickup checkout.
export function CartLines({
  lines,
  menuItems,
  defaultLanguage,
  language,
  frozen,
  readOnly,
  edit,
}: {
  lines: CartLine[];
  menuItems: MenuItem[];
  defaultLanguage: Language;
  language: Language;
  frozen: boolean;
  readOnly: boolean;
  edit: (index: number, patch: Partial<Pick<CartLine, "quantity" | "remark">>) => void;
}) {
  const m = orderMessages[language];
  return (
    <ul className="divide-y">
      {lines.map((line, index) => {
        const name = displayName(line.item, defaultLanguage, language);
        const currentItem = menuItems.find((i) => i.id === line.item.id);
        const available = currentItem?.isAvailable && currentItem.allergenReviewed;
        return (
          <li key={index} className="space-y-2.5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <p lang={name.language} className="min-w-0 font-medium wrap-break-word">
                {readOnly && `${line.quantity} × `}
                {name.text}
              </p>
              <p className="shrink-0 font-semibold tabular-nums">
                {formatMoney(line.item.priceCents * line.quantity, language)}
              </p>
            </div>
            {!available && <p className="text-sm text-destructive">{m.unavailable}</p>}
            {readOnly ? (
              line.remark && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                  {m.remark}: {line.remark}
                </p>
              )
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    aria-label={`${m.decrease}: ${name.text}`}
                    disabled={frozen}
                    onClick={() => edit(index, { quantity: line.quantity - 1 })}
                  >
                    <Minus />
                  </Button>
                  <span
                    className="min-w-8 text-center text-lg font-semibold tabular-nums"
                    aria-label={m.quantity}
                  >
                    {line.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    aria-label={`${m.increase}: ${name.text}`}
                    disabled={frozen || !available || line.quantity >= 20}
                    onClick={() => edit(index, { quantity: line.quantity + 1 })}
                  >
                    <Plus />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(line.item.priceCents, language)} / {m.portions}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={frozen}
                    onClick={() => edit(index, { quantity: 0 })}
                    aria-label={`${m.remove}: ${name.text}`}
                  >
                    {m.remove}
                  </Button>
                </div>
                <Input
                  maxLength={200}
                  placeholder={m.remark}
                  aria-label={`${m.remark} · ${name.text}`}
                  value={line.remark}
                  disabled={frozen}
                  onChange={(event) => edit(index, { remark: event.target.value })}
                />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The cart, its review step and the receipt. Rendered once: a side column on wide screens, a bottom
// sheet on phones, which adds its close button beside the title and closes itself through
// onUnverified/onDone.
export function CartPanel({
  cart: model,
  guest,
  data,
  language,
  headerAction,
  onUnverified,
  onDone,
}: {
  cart: ReturnType<typeof useCart>;
  guest: Guest;
  data: PublicMenu;
  language: Language;
  headerAction?: ReactNode;
  onUnverified?: () => void;
  onDone?: () => void;
}) {
  const m = orderMessages[language];
  const frozen = model.busy || !!model.cart.pending || !!model.review;
  const lines = model.review?.cart.lines ?? model.cart.lines;
  const total = totalCents(lines);
  if (guest.visit.ended)
    return model.message === "endedPending" ? <Notice>{m.endedPending}</Notice> : null;
  return (
    <section id="cart" aria-labelledby="cart-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cart-title" className="text-lg font-semibold">
            {model.review ? m.confirming : m.cart}
          </h2>
          {!model.review && <p className="mt-1 text-sm text-muted-foreground">{m.cartHint}</p>}
        </div>
        {headerAction}
      </div>
      {model.message && <Notice tone={messageTone(model.message)}>{m[model.message]}</Notice>}
      {model.blocked && model.message !== model.blocked && (
        <Notice tone="error">{m[model.blocked]}</Notice>
      )}
      {model.cart.pending && (
        <Notice
          tone="warning"
          action={
            <>
              <Button
                variant="outline"
                disabled={model.busy || !guest.verified}
                onClick={() => void model.recover()}
              >
                {m.lookup}
              </Button>
              <Button
                variant="outline"
                disabled={model.busy || !guest.verified || !!model.blocked}
                onClick={() => void model.retry()}
              >
                {m.retry}
              </Button>
            </>
          }
        >
          {m.unknown}
        </Notice>
      )}
      {model.review && (
        <div className="space-y-1 rounded-xl bg-secondary p-4">
          <p className="text-lg font-semibold wrap-break-word">
            {data.restaurant.name} · {model.review.tableLabel}
          </p>
          <p className="text-sm leading-6">{m.reviewHint}</p>
          {model.review.newVisit && <p className="text-sm font-medium">{m.newVisit}</p>}
        </div>
      )}
      {!lines.length ? (
        model.message !== "success" && (
          <p className="py-6 text-center text-muted-foreground">{m.empty}</p>
        )
      ) : (
        <CartLines
          lines={lines}
          menuItems={data.menu.items}
          defaultLanguage={data.restaurant.defaultLanguage}
          language={language}
          frozen={frozen}
          readOnly={!!model.review}
          edit={model.line}
        />
      )}
      {lines.length > 0 && (
        <>
          <p className="flex items-baseline justify-between gap-3 border-t pt-4 text-lg font-semibold">
            <span>{m.total}</span>
            <span className="text-xl tabular-nums">{formatMoney(total, language)}</span>
          </p>
          {model.review ? (
            <div className="grid gap-2">
              <Button
                size="lg"
                disabled={model.busy || !guest.verified || !!model.blocked}
                onClick={() => void model.confirm()}
              >
                {model.busy ? m.busy : m.confirm}
              </Button>
              <Button variant="outline" size="lg" disabled={model.busy} onClick={model.back}>
                {m.back}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="w-full"
              disabled={model.busy || !!model.cart.pending || !!model.blocked || guest.stale}
              onClick={() => {
                // Phones close the sheet first so the join control the page focuses is reachable.
                if (!guest.verified && guest.visit.sessionId) onUnverified?.();
                void model.prepare();
              }}
            >
              {model.busy ? m.busy : m.review}
            </Button>
          )}
        </>
      )}
      {model.receipt && <OrderCard order={model.receipt} language={language} />}
      {model.receipt && onDone && (
        <Button variant="outline" size="lg" className="w-full" onClick={onDone}>
          {m.keepOrdering}
        </Button>
      )}
    </section>
  );
}

export function TableOrders({
  guest,
  data,
  language,
}: {
  guest: Guest;
  data: PublicMenu;
  language: Language;
}) {
  const sessionId = guest.visit.sessionId ?? "";
  const m = orderMessages[language];
  const query = useInfiniteQuery({
    queryKey: ordersKey(data.restaurant.id, data.table.id, sessionId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readOrders(sessionId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: guest.verified && !!sessionId && !guest.visit.ended,
    refetchInterval: guest.verified ? 30_000 : false,
  });
  const handled = useRef<unknown>(null);
  const invalidate = guest.invalidate;
  useEffect(() => {
    if (query.error === handled.current) return;
    handled.current = query.error;
    if (query.error instanceof ApiError && accessOutcome(query.error.code))
      invalidate(query.error.code);
  }, [query.error, invalidate]);
  if (!guest.verified || guest.visit.ended) return null;
  const pages = query.data?.pages ?? [];
  const orders = uniqueBy(
    pages.flatMap((p) => p.items),
    (o) => o.id,
  );
  return (
    <section id="table-orders" aria-labelledby="orders-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="orders-title" className="text-lg font-semibold">
            {m.orders}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.ordersHint}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={m.refresh}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={cn(query.isFetching && "animate-spin")} />
        </Button>
      </div>
      {pages.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-4">
          <span className="text-sm leading-5">{m.effectiveTotal}</span>
          <span className="shrink-0 text-xl font-semibold tabular-nums">
            {formatMoney(pages[0].totalAmountCents, language)}
          </span>
        </div>
      )}
      {query.isError && <Notice tone="warning">{m.stale}</Notice>}
      {query.dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          {m.updated}: {formatDateTime(query.dataUpdatedAt, language)}
        </p>
      )}
      {query.isPending && <LoadingState label={m.busy} />}
      {!query.isPending && !orders.length && !query.isError && (
        <p className="py-6 text-center text-muted-foreground">{m.noOrders}</p>
      )}
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} language={language} />
      ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {m.more}
        </Button>
      )}
    </section>
  );
}
