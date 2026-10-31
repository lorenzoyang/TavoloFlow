import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice, type NoticeTone } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { readLanguage, saveLanguage, selectedLanguage } from "@/features/public-menu/language";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { formatMoney, formatTime } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { useLiveView } from "@/lib/useLiveView";
import { cn } from "@/lib/utils";
import { pickupOrderQuery, type PickupOrder } from "./api";
import { onlineOrderMessages } from "./messages";
import { CallButton } from "./OnlineMenuPage";
import { statusView, type PickupOrderStatus } from "./state";

const tones: Record<PickupOrderStatus, NoticeTone> = {
  PENDING: "info",
  ACCEPTED: "info",
  READY: "success",
  PICKED_UP: "success",
  EXPIRED: "warning",
  REJECTED: "warning",
  CANCELLED: "warning",
  CLOSED: "info",
};

function OrderStatus({ order, now }: { order: PickupOrder; now: number }) {
  const [preference, setPreference] = useState<Language | null>(() => {
    try {
      return readLanguage(order.restaurant.id, window.localStorage);
    } catch {
      return null;
    }
  });
  const language = selectedLanguage(preference, order.restaurant.defaultLanguage);
  useDocumentTheme(order.restaurant.theme);
  const m = onlineOrderMessages[language];
  const s = m.status;
  const view = statusView(order.status, order.rejectReason);
  const phone = order.restaurant.phone;
  const minutesLeft = Math.max(0, Math.ceil((Date.parse(order.expiresAt) - now) / 60_000));
  return (
    <div lang={language} className="min-h-dvh">
      <header className="border-b bg-card pt-safe">
        <div className="mx-auto flex max-w-xl flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-display text-xl leading-tight font-semibold wrap-break-word">
              {order.restaurant.name}
            </p>
            <h1 className="mt-1 text-3xl font-bold tabular-nums">{s.title(order.pickupNumber)}</h1>
          </div>
          <LanguageToggle
            language={language}
            select={(value) => {
              setPreference(value);
              saveLanguage(order.restaurant.id, value, window.localStorage);
            }}
          />
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-5 px-4 pt-5 pb-12">
        <Notice tone={tones[order.status]}>
          <span className="block text-base font-semibold">{s[view.headline]}</span>
          {order.status === "ACCEPTED" && order.estimatedReadyAt && (
            <span className="block">{s.readyAt(formatTime(order.estimatedReadyAt, language))}</span>
          )}
          {order.status === "PENDING" && (
            <span className="block">{s.waitingLeft(minutesLeft)}</span>
          )}
        </Notice>
        {phone && view.callFirst && <CallButton phone={phone} language={language} prominent />}
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{s.name}</dt>
            <dd className="font-medium wrap-break-word">{order.customerName}</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            {s.submitted(formatTime(order.submittedAt, language))}
          </p>
          <h2 className="pt-2 font-semibold">{s.items}</h2>
          <ul className="divide-y">
            {order.items.map((line, index) => {
              const name = displayName(line, order.restaurant.defaultLanguage, language);
              return (
                <li key={index} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p
                      lang={name.language}
                      className={cn(
                        "font-medium wrap-break-word",
                        line.cancelled && "text-muted-foreground line-through",
                      )}
                    >
                      {line.quantity} × {name.text}
                    </p>
                    {line.remark && (
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                        {line.remark}
                      </p>
                    )}
                    {line.cancelled && <Badge variant="outline">{s.cancelled}</Badge>}
                  </div>
                  <p
                    className={cn(
                      "shrink-0 tabular-nums",
                      line.cancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {formatMoney(line.unitPriceCents * line.quantity, language)}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="flex items-baseline justify-between gap-3 border-t pt-3 text-lg font-semibold">
            <span>{s.payable}</span>
            <span className="tabular-nums">{formatMoney(order.payableAmountCents, language)}</span>
          </p>
        </section>
        {phone && !view.callFirst && <CallButton phone={phone} language={language} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {order.restaurant.slug && (
            <Link
              to="/r/$slug"
              params={{ slug: order.restaurant.slug }}
              className={buttonVariants({ variant: "ghost" })}
            >
              {s.backToMenu}
            </Link>
          )}
          {!view.finished && <p className="text-xs text-muted-foreground">{s.updated}</p>}
        </div>
      </main>
    </div>
  );
}

// Polls every 10 seconds while the order runs; the query pauses offline and in the background.
export function PickupStatusPage({ token }: { token: string }) {
  const live = useLiveView();
  const query = useQuery({
    ...pickupOrderQuery(token),
    refetchInterval: (q) =>
      q.state.data && !statusView(q.state.data.status, q.state.data.rejectReason).finished
        ? 10_000
        : false,
  });
  const [language, setLanguage] = useState<Language>("it");
  const m = onlineOrderMessages[language];
  if (query.data) return <OrderStatus order={query.data} now={live.now} />;
  const failed = query.isError || query.fetchStatus === "paused";
  return (
    <main
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10"
    >
      <BrandMark />
      <h1 className="sr-only">{m.pickup}</h1>
      <LanguageToggle language={language} select={setLanguage} />
      <Notice tone={query.data === null || failed ? "error" : "info"}>
        {query.data === null ? m.status.notFound : failed ? m.status.error : m.status.loading}
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
