import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRODUCT_NAME } from "@/lib/brand";
import type { Language } from "@/lib/language";
import { useMediaQuery, WIDE_SCREEN } from "@/lib/useMediaQuery";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { publicMenuQuery, type PublicMenu } from "./api";
import { readLanguage, saveLanguage, selectedLanguage } from "./language";
import { messages } from "./messages";
import { CartBar, LanguageToggle, MenuHeader, MenuList, type MenuCart } from "./PublicMenuViews";
import { GuestPanel } from "@/features/guests/GuestPanel";
import { guestKeys } from "@/features/guests/api";
import { useGuestVisit } from "@/features/guests/useGuestVisit";
import { useCart } from "@/features/orders/useCart";
import { CartPanel, TableOrders } from "@/features/orders/OrderViews";
import { orderMessages } from "@/features/orders/messages";
import { cartKey } from "@/features/orders/state";
import { guestVisitKey } from "@/features/guests/state";

function MenuContent({
  token,
  data,
  confirmedAt,
  error,
  refreshing,
  refresh,
  rememberLanguage,
}: {
  token: string;
  data: PublicMenu;
  confirmedAt: number;
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
  // Only a loaded menu is themed: loading and invalid-QR screens keep the default palette.
  useDocumentTheme(data.restaurant.theme);
  const guest = useGuestVisit(token, data, confirmedAt, error);
  const cart = useCart(token, data, guest, confirmedAt);
  // Keep error/invalid-QR messages in the viewer's language after the menu disappears.
  useEffect(() => {
    rememberLanguage(language);
  }, [language, rememberLanguage]);
  const wide = useMediaQuery(WIDE_SCREEN);
  const [categoryId, setCategoryId] = useState("");
  const [view, setView] = useState<"menu" | "orders">("menu");
  const [cartOpen, setCartOpen] = useState(false);
  // Set when the phone cart closes to let the guest join first: focus then goes to the join control.
  const focusJoin = useRef(false);
  const m = messages[language];
  const om = orderMessages[language];
  const serviceNotice =
    data.restaurant.serviceStatus === "SUSPENDED" || !data.restaurant.dineInEnabled
      ? m.suspended
      : !data.table.isEnabled
        ? m.disabled
        : !data.restaurant.orderingEnabled
          ? m.paused
          : !data.activeSessionId
            ? m.unopened
            : null;
  function selectLanguage(value: Language) {
    setPreference(value);
    try {
      saveLanguage(data.restaurant.id, value, window.localStorage);
    } catch {
      /* Storage can be unavailable. */
    }
  }
  const cartPanel = (
    <CartPanel
      cart={cart}
      guest={guest}
      data={data}
      language={language}
      headerAction={
        wide ? undefined : (
          <SheetClose
            render={
              <Button variant="ghost" size="icon" aria-label={om.close} className="-mt-2 -mr-2" />
            }
          >
            <X />
          </SheetClose>
        )
      }
      onUnverified={
        wide
          ? undefined
          : () => {
              focusJoin.current = true;
              setCartOpen(false);
            }
      }
      onDone={wide ? undefined : () => setCartOpen(false)}
    />
  );
  const menuCart: MenuCart = { lines: cart.cart.lines, stage: cart.stage, add: cart.add };
  const menu = (
    <MenuList
      menu={data.menu}
      defaultLanguage={data.restaurant.defaultLanguage}
      language={language}
      cart={menuCart}
      categoryId={categoryId}
      selectCategory={setCategoryId}
    />
  );
  return (
    <div lang={language} className="min-h-dvh">
      <MenuHeader
        restaurantName={data.restaurant.name}
        subtitle={`${m.table} ${data.table.tableLabel}`}
        language={language}
        selectLanguage={selectLanguage}
        refreshing={refreshing}
        refresh={refresh}
      />
      <div className="mx-auto max-w-6xl px-4 pb-36 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8 lg:pb-12">
        <main className="min-w-0 space-y-5 pt-5">
          <GuestPanel guest={guest} language={language} />
          {guest.visit.ended ? (
            cartPanel
          ) : (
            <>
              {serviceNotice && (
                <Notice tone={serviceNotice === m.unopened ? "info" : "warning"}>
                  {serviceNotice}
                </Notice>
              )}
              {!serviceNotice && !guest.verified && (
                <p className="text-sm leading-6 text-muted-foreground">{m.order}</p>
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
              {guest.verified ? (
                <Tabs
                  value={view}
                  onValueChange={(value: "menu" | "orders") => setView(value)}
                  className="gap-5"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="menu">{om.menuTab}</TabsTrigger>
                    <TabsTrigger value="orders">{om.orders}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="menu" keepMounted>
                    {menu}
                  </TabsContent>
                  <TabsContent value="orders" keepMounted>
                    <TableOrders guest={guest} data={data} language={language} />
                  </TabsContent>
                </Tabs>
              ) : (
                menu
              )}
              <footer className="border-t pt-5 text-xs leading-6 text-muted-foreground">
                {m.allergyHint}
              </footer>
            </>
          )}
        </main>
        {wide && !guest.visit.ended && (
          <aside className="sticky top-6 mt-5 max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xs">
            {cartPanel}
          </aside>
        )}
      </div>
      {!wide && !guest.visit.ended && (
        <>
          {cart.cart.lines.length > 0 && (
            <CartBar cart={menuCart} language={language} open={() => setCartOpen(true)} />
          )}
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              aria-labelledby="cart-title"
              finalFocus={() => {
                if (!focusJoin.current) return true;
                focusJoin.current = false;
                return (
                  document.getElementById("guest-join-code") ??
                  document.getElementById("guest-join-direct") ??
                  true
                );
              }}
              className="max-h-[90dvh] gap-0 rounded-t-3xl"
            >
              <div className="pb-safe overflow-y-auto px-4 pt-5">{cartPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

export function PublicMenuPage({ token }: { token: string }) {
  const client = useQueryClient();
  const query = useQuery(publicMenuQuery(token));
  const previous = useRef<{ token: string; data: PublicMenu } | null>(null);
  useEffect(() => {
    if (query.data) {
      previous.current = { token, data: query.data };
      return;
    }
    if (query.data !== null || previous.current?.token !== token) return;
    const old = previous.current.data;
    void client.cancelQueries({ queryKey: guestKeys.table(old.restaurant.id, old.table.id) });
    client.removeQueries({ queryKey: guestKeys.table(old.restaurant.id, old.table.id) });
    try {
      sessionStorage.removeItem(cartKey(old.restaurant.id, old.table.id));
      sessionStorage.setItem(
        guestVisitKey(token),
        JSON.stringify({ sessionId: old.activeSessionId, skipped: false, ended: true }),
      );
    } catch {
      /* Invalid QR remains a server-enforced terminal state even without storage. */
    }
    previous.current = null;
  }, [query.data, token, client]);
  const [language, setLanguage] = useState<Language>("it");
  const m = messages[language];
  if (query.data)
    return (
      <MenuContent
        key={`${query.data.restaurant.id}:${query.data.table.id}:${token}`}
        token={token}
        data={query.data}
        confirmedAt={query.isFetchedAfterMount && !query.isError ? query.dataUpdatedAt : 0}
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
      <h1 className="sr-only">
        {PRODUCT_NAME} · {m.menu}
      </h1>
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
