import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { displayName, type Language } from "@/features/menu/language";
import { allergenNames } from "@/features/public-menu/messages";
import type { PublicMenu } from "@/features/public-menu/api";
import type { useGuestVisit } from "@/features/guests/useGuestVisit";
import { accessOutcome } from "@/features/guests/state";
import { ApiError } from "@/lib/api";
import { ordersKey, readOrders, type Order } from "./api";
import { orderMessages } from "./messages";
import { totalCents } from "./state";
import type { useCart } from "./useCart";
import { money } from "./format";

const date = (value: string, language: Language) => new Date(value).toLocaleString(language === "zh" ? "zh-CN" : language, { timeZone: "Europe/Rome" });

function OrderCard({ order, language }: { order: Order; language: Language }) {
  const m = orderMessages[language];
  return <Card><CardContent className="space-y-4 pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <p className="text-xs text-muted-foreground break-all">#{order.id}</p><p className="mt-1 text-sm">{date(order.createdAt, language)}</p></div>
      <Badge variant={order.status === "CANCELLED" ? "outline" : "secondary"}>{m[order.status]}</Badge></div>
    <ul className="divide-y">{order.items.map(line => {
      const name = displayName(line, order.defaultLanguage, language);
      return <li key={line.id} className="space-y-2 py-3">
        <div className="flex items-start justify-between gap-3"><p lang={name.language} className="min-w-0 wrap-break-word font-medium">{line.itemCode && <span className="mr-2 text-xs text-muted-foreground">{line.itemCode}</span>}{name.text} × {line.quantity}</p>
          <span className="shrink-0 tabular-nums">{money(line.unitPriceCents * line.quantity, language)}</span></div>
        <p className="text-xs text-muted-foreground">{money(line.unitPriceCents, language)} × {line.quantity}</p>
        {line.remark && <p className="whitespace-pre-wrap wrap-break-word text-sm">{m.remark}: {line.remark}</p>}
        {line.allergenCodes.length > 0 && <p className="text-xs text-muted-foreground">{m.allergies}: {line.allergenCodes.map(c => allergenNames[language][c] ?? c).join(" · ")}</p>}
      </li>;
    })}</ul>
    {order.orderNote && <p className="whitespace-pre-wrap wrap-break-word text-sm">{m.orderNote}: {order.orderNote}</p>}
    <p className={`text-right font-semibold tabular-nums ${order.status === "CANCELLED" ? "line-through text-muted-foreground" : ""}`}>{m.total}: {money(order.totalAmountCents, language)}</p>
  </CardContent></Card>;
}

export function CartPanel({ cart: model, guest, data, language }: {
  cart: ReturnType<typeof useCart>; guest: ReturnType<typeof useGuestVisit>; data: PublicMenu; language: Language;
}) {
  const m = orderMessages[language];
  const frozen = model.busy || !!model.cart.pending || !!model.review;
  const lines = model.review?.cart.lines ?? model.cart.lines;
  const total = totalCents(lines);
  if (guest.visit.ended) return model.message === "endedPending" ? <Alert><AlertDescription>{m.endedPending}</AlertDescription></Alert> : null;
  return <section id="cart" aria-labelledby="cart-title" className="scroll-mt-6 space-y-4">
    <Card><CardContent className="space-y-5 pt-6">
      <div><h2 id="cart-title" className="text-xl font-semibold">{model.review ? m.confirming : m.cart}</h2><p className="mt-2 text-sm text-muted-foreground">{m.cartHint}</p></div>
      {model.message && <Alert role="status"><AlertDescription>{m[model.message]}</AlertDescription></Alert>}
      {model.blocked && model.message !== model.blocked && <Alert variant="destructive"><AlertDescription>{m[model.blocked]}</AlertDescription></Alert>}
      {model.cart.pending && <Alert role="status"><AlertDescription className="space-y-3"><p>{m.unknown}</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={model.busy || !guest.verified} onClick={() => void model.recover()}>{m.lookup}</Button>
          <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={model.busy || !guest.verified || !!model.blocked} onClick={() => void model.retry()}>{m.retry}</Button></div></AlertDescription></Alert>}
      {model.review && <Alert><AlertDescription className="space-y-2"><p className="text-lg font-semibold">{data.restaurant.name} · {model.review.tableLabel}</p>
        <p>{m.reviewHint}</p>{model.review.newVisit && <p>{m.newVisit}</p>}</AlertDescription></Alert>}
      {!lines.length ? <p className="py-4 text-muted-foreground">{m.empty}</p> : <ul className="divide-y">{lines.map((line, index) => {
        const name = displayName(line.item, data.restaurant.defaultLanguage, language);
        const currentItem = data.menu.items.find(i => i.id === line.item.id);
        const available = currentItem?.isAvailable && currentItem.allergenReviewed;
        return <li key={index} className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-3"><p lang={name.language} className="min-w-0 font-medium wrap-break-word">{name.text}</p>
            <p className="shrink-0 tabular-nums">{money(line.item.priceCents * line.quantity, language)}</p></div>
          {!available && <p className="text-sm text-destructive">{m.unavailable}</p>}
          <div className="flex flex-wrap items-center gap-2"><Button variant="outline" className="size-11" aria-label={`${m.decrease}: ${name.text}`} disabled={frozen} onClick={() => model.line(index, { quantity: line.quantity - 1 })}>−</Button>
            <span className="min-w-8 text-center tabular-nums" aria-label={m.quantity}>{line.quantity}</span>
            <Button variant="outline" className="size-11" aria-label={`${m.increase}: ${name.text}`} disabled={frozen || !available || line.quantity >= 20} onClick={() => model.line(index, { quantity: line.quantity + 1 })}>+</Button>
            <span className="text-xs text-muted-foreground">{money(line.item.priceCents, language)} / {m.portions}</span>
            <Button variant="ghost" className="ml-auto min-h-11" disabled={frozen} onClick={() => model.line(index, { quantity: 0 })} aria-label={`${m.remove}: ${name.text}`}>{m.remove}</Button></div>
          <label className="block space-y-2 text-sm"><span>{m.remark} · {name.text}</span><Input className="min-h-11" maxLength={200} value={line.remark} disabled={frozen}
            onChange={event => model.line(index, { remark: event.target.value })} /></label>
        </li>;
      })}</ul>}
      {lines.length > 0 && <><div className="space-y-2 text-sm"><label htmlFor="order-note">{m.orderNote}</label>
        <textarea id="order-note" className="min-h-22 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          maxLength={500} value={model.cart.orderNote} disabled={frozen} onChange={event => model.note(event.target.value)} /></div>
        <p className="flex justify-between gap-3 text-lg font-semibold"><span>{m.total}</span><span className="tabular-nums">{money(total, language)}</span></p>
        <div className="flex flex-wrap gap-3">{model.review ? <>
          <Button className="min-h-12 h-auto whitespace-normal" disabled={model.busy || !guest.verified || !!model.blocked} onClick={() => void model.confirm()}>{model.busy ? m.busy : m.confirm}</Button>
          <Button variant="outline" className="min-h-12" disabled={model.busy} onClick={model.back}>{m.back}</Button>
        </> : <Button className="min-h-12 h-auto whitespace-normal" disabled={model.busy || !!model.cart.pending || !!model.blocked || guest.stale}
          onClick={() => void model.prepare()}>{model.busy ? m.busy : m.review}</Button>}</div></>}
    </CardContent></Card>
    {model.receipt && <OrderCard order={model.receipt} language={language} />}
  </section>;
}

export function TableOrders({ guest, data, language }: { guest: ReturnType<typeof useGuestVisit>; data: PublicMenu; language: Language }) {
  const sessionId = guest.visit.sessionId ?? "";
  const m = orderMessages[language];
  const query = useInfiniteQuery({ queryKey: ordersKey(data.restaurant.id, data.table.id, sessionId), initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readOrders(sessionId, pageParam, signal), getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: guest.verified && !!sessionId && !guest.visit.ended, refetchInterval: guest.verified ? 30_000 : false });
  const handled = useRef<unknown>(null);
  const invalidate = guest.invalidate;
  useEffect(() => {
    if (query.error === handled.current) return;
    handled.current = query.error;
    if (query.error instanceof ApiError && accessOutcome(query.error.code)) invalidate(query.error.code);
  }, [query.error, invalidate]);
  if (!guest.verified || guest.visit.ended) return null;
  const pages = query.data?.pages ?? [];
  const orders = Array.from(new Map(pages.flatMap(p => p.items).map(o => [o.id, o])).values());
  return <section id="table-orders" aria-labelledby="orders-title" className="space-y-4">
    <div><h2 id="orders-title" className="text-xl font-semibold">{m.orders}</h2><p className="mt-2 text-sm text-muted-foreground">{m.ordersHint}</p></div>
    <Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{m.refresh}</Button>
    {query.isPending && <p role="status">{m.busy}</p>}
    {query.isError && <Alert variant="destructive"><AlertDescription>{m.stale}</AlertDescription></Alert>}
    {query.dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">{m.updated}: {date(new Date(query.dataUpdatedAt).toISOString(), language)}</p>}
    {!query.isPending && !orders.length && !query.isError && <p>{m.noOrders}</p>}
    {orders.map(order => <OrderCard key={order.id} order={order} language={language} />)}
    {query.hasNextPage && <Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{m.more}</Button>}
    {pages.length > 0 && <p className="rounded-xl border bg-card p-4 font-semibold">{m.effectiveTotal}: <span className="tabular-nums">{money(pages[0].totalAmountCents, language)}</span></p>}
  </section>;
}
