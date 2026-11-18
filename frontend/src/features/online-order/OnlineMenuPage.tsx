import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatWeekdayTime } from "@/lib/format";
import type { Language } from "@/lib/language";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { useMediaQuery, WIDE_SCREEN } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { orderMessages } from "@/features/orders/messages";
import { messages as menuMessages } from "@/features/public-menu/messages";
import {
  CartBar,
  LanguageToggle,
  MenuList,
  MenuSkeleton,
} from "@/features/public-menu/PublicMenuViews";
import { onlineMenuQuery, type OnlineMenu } from "./api";
import { onlineOrderMessages } from "./messages";
import { ActiveOrder, OnlineCartPanel, OnlineHeader, OrderingContextNotice } from "./OnlineViews";
import { useRestaurantLanguage } from "./useRestaurantLanguage";
import { useOnlineCart } from "./useOnlineCart";

// Why customers cannot order right now, or null while they can.
function closedNotice(data: OnlineMenu, language: Language): string | null {
  const m = onlineOrderMessages[language];
  switch (data.status) {
    case "OPEN":
      return null;
    case "BUSY":
      return m.busy;
    case "PAUSED":
      return m.paused;
    case "CLOSED_HOURS":
      return data.nextOpensAt
        ? m.closedHours(formatWeekdayTime(data.nextOpensAt, language))
        : m.closedNoHours;
    case "NOT_OFFERED":
      return m.notOffered;
    case "SUSPENDED":
      return m.suspended;
  }
}

function MenuContent({
  slug,
  data,
  error,
  refreshing,
  refresh,
}: {
  slug: string;
  data: OnlineMenu;
  error: boolean;
  refreshing: boolean;
  refresh: () => void;
}) {
  const [language, selectLanguage] = useRestaurantLanguage(
    data.restaurant.id,
    data.restaurant.defaultLanguage,
  );
  useDocumentTheme(data.restaurant.theme);
  const cart = useOnlineCart(slug, data);
  const wide = useMediaQuery(WIDE_SCREEN);
  const [categoryId, setCategoryId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const m = onlineOrderMessages[language];
  const mm = menuMessages[language];
  const closed = closedNotice(data, language);
  const phone = data.restaurant.publicPhone;
  const cartPanel = (
    <OnlineCartPanel
      cart={cart}
      data={data}
      slug={slug}
      language={language}
      closedNotice={closed}
      headerAction={
        wide ? undefined : (
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={orderMessages[language].close}
                className="-mt-2 -mr-2"
              />
            }
          >
            <X />
          </SheetClose>
        )
      }
    />
  );
  return (
    <div lang={language} className="min-h-dvh">
      <OnlineHeader
        name={data.restaurant.name}
        phone={phone}
        delivery={data.restaurant.deliveryEnabled}
        language={language}
        selectLanguage={selectLanguage}
        action={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.retry}
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        }
      />
      <div className="mx-auto max-w-6xl px-4 pb-36 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8 lg:pb-12">
        <main className="min-w-0 space-y-5 pt-5">
          <OrderingContextNotice model={cart} language={language} />
          {!cart.waitingOrder && (
            <ActiveOrder restaurantId={data.restaurant.id} language={language} />
          )}
          {closed ? (
            // Text only: the header keeps the restaurant's phone right above it.
            <Notice tone="warning">{closed}</Notice>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">{m.open}</p>
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
              {m.stale}
            </Notice>
          )}
          <MenuList
            data={data}
            language={language}
            cart={cart}
            categoryId={categoryId}
            selectCategory={setCategoryId}
          />
          <footer className="space-y-1 border-t pt-5 text-xs leading-6 text-muted-foreground">
            <p>{mm.allergyHint}</p>
            <p>
              <Link to="/r/$slug/privacy" params={{ slug }} className="underline">
                {m.privacy}
              </Link>
            </p>
          </footer>
        </main>
        {wide && (
          // The panel scrolls its own body between a fixed head and footer, and pads itself.
          <aside className="sticky top-6 mt-5 flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
            {cartPanel}
          </aside>
        )}
      </div>
      {!wide && (
        <>
          {cart.cart.lines.length > 0 && (
            <CartBar
              cart={cart}
              amountCents={cart.amounts.payableCents}
              language={language}
              open={() => setCartOpen(true)}
            />
          )}
          <Sheet
            open={cartOpen}
            onOpenChange={(open) => {
              if (!open) cart.back();
              setCartOpen(open);
            }}
          >
            <SheetContent
              side="bottom"
              showCloseButton={false}
              aria-labelledby="cart-title"
              className="max-h-[90dvh] gap-0 rounded-t-3xl"
            >
              {cartPanel}
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

// The restaurant's own online link. Anonymous: no store or guest identity is involved.
export function OnlineMenuPage({ slug }: { slug: string }) {
  const query = useQuery(onlineMenuQuery(slug));
  const [language, setLanguage] = useState<Language>("it");
  if (query.data)
    return (
      <MenuContent
        key={query.data.restaurant.id}
        slug={slug}
        data={query.data}
        error={query.isError || query.fetchStatus === "paused"}
        refreshing={query.isFetching}
        refresh={() => void query.refetch()}
      />
    );
  const m = onlineOrderMessages[language];
  const failed = query.isError || query.fetchStatus === "paused";
  if (query.data === undefined && !failed) return <MenuSkeleton language={language} />;
  return (
    <main
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10"
    >
      <BrandMark />
      <h1 className="sr-only">
        {PRODUCT_NAME} · {m.title}
      </h1>
      <LanguageToggle language={language} select={setLanguage} />
      <Notice tone="error">{query.data === null ? m.invalidLink : m.error}</Notice>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        <RefreshCw />
        {m.retry}
      </Button>
    </main>
  );
}
