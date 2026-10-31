import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone, RefreshCw, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { CartLines } from "@/features/orders/OrderViews";
import { orderMessages } from "@/features/orders/messages";
import { totalCents } from "@/features/orders/state";
import { readLanguage, saveLanguage, selectedLanguage } from "@/features/public-menu/language";
import { messages as menuMessages } from "@/features/public-menu/messages";
import {
  CartBar,
  LanguageToggle,
  MenuHeader,
  MenuList,
  type MenuCart,
} from "@/features/public-menu/PublicMenuViews";
import { formatMoney, formatOpening } from "@/lib/format";
import type { Language } from "@/lib/language";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { useMediaQuery, WIDE_SCREEN } from "@/lib/useMediaQuery";
import { onlineMenuQuery, pickupOrderQuery, type OnlineMenu } from "./api";
import { onlineOrderMessages } from "./messages";
import { readOrderToken, statusView } from "./state";
import { usePickupCart } from "./usePickupCart";

export function CallButton({
  phone,
  language,
  prominent = false,
}: {
  phone: string;
  language: Language;
  prominent?: boolean;
}) {
  return (
    <a
      href={`tel:${phone}`}
      className={buttonVariants({ variant: prominent ? "default" : "outline", size: "lg" })}
    >
      <Phone />
      {onlineOrderMessages[language].call(phone)}
    </a>
  );
}

// The guest's latest request at this restaurant, while it is still running.
function OngoingOrder({ restaurantId, language }: { restaurantId: string; language: Language }) {
  const [token] = useState(() => readOrderToken(restaurantId, localStorage));
  const order = useQuery({ ...pickupOrderQuery(token ?? ""), enabled: !!token });
  const m = onlineOrderMessages[language];
  if (!token || !order.data || statusView(order.data.status, order.data.rejectReason).finished)
    return null;
  return (
    <Notice
      tone="info"
      action={
        <Link to="/o/$token" params={{ token }} className={buttonVariants({ variant: "outline" })}>
          {m.viewOrder}
        </Link>
      }
    >
      {m.ongoing(order.data.pickupNumber)}
    </Notice>
  );
}

function Checkout({
  model,
  data,
  language,
  headerAction,
}: {
  model: ReturnType<typeof usePickupCart>;
  data: OnlineMenu;
  language: Language;
  headerAction?: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  const om = orderMessages[language];
  const pending = model.cart.pending;
  const frozen = model.busy || !!pending;
  const open = data.pickup.status === "OPEN";
  const lines = model.cart.lines;
  const message = model.message;
  return (
    <section id="cart" aria-labelledby="cart-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cart-title" className="text-lg font-semibold">
            {m.cart}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.cartHint}</p>
        </div>
        {headerAction}
      </div>
      {message && (
        <Notice tone="warning">
          {message.key === "closed" && message.until
            ? m.messages.closedUntil(formatOpening(message.until, language))
            : m.messages[message.key]}
        </Notice>
      )}
      {pending && (
        <Notice
          tone="warning"
          action={
            <>
              <Button variant="outline" disabled={model.busy} onClick={() => void model.recover()}>
                {m.lookup}
              </Button>
              <Button
                variant="outline"
                disabled={model.busy || !!model.blocked}
                onClick={() => void model.retry()}
              >
                {m.resend}
              </Button>
            </>
          }
        >
          {m.pending}
        </Notice>
      )}
      {lines.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{m.empty}</p>
      ) : (
        <>
          <CartLines
            lines={lines}
            menuItems={data.menu.items}
            defaultLanguage={data.restaurant.defaultLanguage}
            language={language}
            frozen={frozen}
            readOnly={!!pending}
            edit={model.line}
          />
          <p className="flex items-baseline justify-between gap-3 border-t pt-4 text-lg font-semibold">
            <span>{om.total}</span>
            <span className="text-xl tabular-nums">{formatMoney(totalCents(lines), language)}</span>
          </p>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void model.submit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pickup-name">{m.name}</Label>
              <Input
                id="pickup-name"
                autoComplete="name"
                maxLength={20}
                value={model.name}
                disabled={frozen}
                aria-describedby="pickup-name-hint"
                onChange={(event) => model.setName(event.target.value)}
              />
              <p id="pickup-name-hint" className="text-xs text-muted-foreground">
                {m.nameHint}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pickup-phone">{m.phone}</Label>
              <Input
                id="pickup-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={32}
                value={model.phone}
                disabled={frozen}
                aria-describedby="pickup-phone-hint"
                onChange={(event) => model.setPhone(event.target.value)}
              />
              <p id="pickup-phone-hint" className="text-xs text-muted-foreground">
                {m.phoneHint}
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{m.privacy}</p>
            {!pending && (
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={model.busy || !!model.blocked || !open}
              >
                {model.busy ? m.busy : open ? m.submit : m.closedButton}
              </Button>
            )}
          </form>
        </>
      )}
    </section>
  );
}

function OnlineMenuContent({
  slug,
  data,
  error,
  refreshing,
  refresh,
  rememberLanguage,
}: {
  slug: string;
  data: OnlineMenu;
  error: boolean;
  refreshing: boolean;
  refresh: () => void;
  rememberLanguage: (language: Language) => void;
}) {
  const [preference, setPreference] = useState<Language | null>(() => {
    try {
      return readLanguage(data.restaurant.id, window.localStorage);
    } catch {
      return null;
    }
  });
  const language = selectedLanguage(preference, data.restaurant.defaultLanguage);
  useDocumentTheme(data.restaurant.theme);
  useEffect(() => {
    rememberLanguage(language);
  }, [language, rememberLanguage]);
  const model = usePickupCart(slug, data);
  const wide = useMediaQuery(WIDE_SCREEN);
  const [categoryId, setCategoryId] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const m = onlineOrderMessages[language];
  const mm = menuMessages[language];
  const status = data.pickup.status;
  // Without the service there is nothing to order; paused or closed hours still let guests prepare a cart.
  const ordering = status !== "NOT_OFFERED" && status !== "SUSPENDED";
  const cart: MenuCart = {
    lines: model.cart.lines,
    stage: ordering ? model.stage : "busy",
    add: model.add,
  };
  function selectLanguage(value: Language) {
    setPreference(value);
    saveLanguage(data.restaurant.id, value, window.localStorage);
  }
  const checkout = (
    <Checkout
      model={model}
      data={data}
      language={language}
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
      <MenuHeader
        restaurantName={data.restaurant.name}
        subtitle={m.pickup}
        language={language}
        selectLanguage={selectLanguage}
        refreshing={refreshing}
        refresh={refresh}
      />
      <div className="mx-auto max-w-6xl px-4 pb-36 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8 lg:pb-12">
        <main className="min-w-0 space-y-5 pt-5">
          <OngoingOrder restaurantId={data.restaurant.id} language={language} />
          <Notice
            tone={status === "OPEN" ? "info" : "warning"}
            action={
              status !== "OPEN" && data.restaurant.phone ? (
                <CallButton phone={data.restaurant.phone} language={language} />
              ) : undefined
            }
          >
            {m.availability[status]}
            {status === "CLOSED_HOURS" && data.pickup.nextOpensAt && (
              <> {m.opensAt(formatOpening(data.pickup.nextOpensAt, language))}</>
            )}
          </Notice>
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
            menu={data.menu}
            defaultLanguage={data.restaurant.defaultLanguage}
            language={language}
            cart={cart}
            categoryId={categoryId}
            selectCategory={setCategoryId}
          />
          <footer className="space-y-3 border-t pt-5 text-xs leading-6 text-muted-foreground">
            <p>{mm.allergyHint}</p>
            {data.restaurant.phone && (
              <CallButton phone={data.restaurant.phone} language={language} />
            )}
          </footer>
        </main>
        {wide && ordering && (
          <aside className="sticky top-6 mt-5 max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xs">
            {checkout}
          </aside>
        )}
      </div>
      {!wide && ordering && (
        <>
          {model.cart.lines.length > 0 && (
            <CartBar cart={cart} language={language} open={() => setCartOpen(true)} />
          )}
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              aria-labelledby="cart-title"
              className="max-h-[90dvh] gap-0 rounded-t-3xl"
            >
              <div className="pb-safe overflow-y-auto px-4 pt-5">{checkout}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

export function OnlineMenuPage({ slug }: { slug: string }) {
  const query = useQuery(onlineMenuQuery(slug));
  const [language, setLanguage] = useState<Language>("it");
  const m = onlineOrderMessages[language];
  if (query.data)
    return (
      <OnlineMenuContent
        key={query.data.restaurant.id}
        slug={slug}
        data={query.data}
        error={query.isError || query.fetchStatus === "paused"}
        refreshing={query.isFetching}
        refresh={() => void query.refetch()}
        rememberLanguage={setLanguage}
      />
    );
  const failed = query.isError || query.fetchStatus === "paused";
  return (
    <main
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10"
    >
      <BrandMark />
      <h1 className="sr-only">{m.menu}</h1>
      <LanguageToggle language={language} select={setLanguage} />
      <Notice tone={query.data === null || failed ? "error" : "info"}>
        {query.data === null ? m.invalid : failed ? m.error : m.loading}
      </Notice>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        <RefreshCw />
        {m.retry}
      </Button>
    </main>
  );
}
