import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bike, Phone, ShoppingBag, type LucideIcon } from "lucide-react";
import { Notice, type NoticeTone } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatMoney } from "@/lib/format";
import type { Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import { RestaurantHeader } from "@/features/public-menu/PublicMenuViews";
import { CartLines, EmptyCart } from "@/features/orders/OrderViews";
import { onlineOrderQuery, type OnlineMenu } from "./api";
import { onlineOrderMessages, type OnlineOrderMessage } from "./messages";
import { clearOrderToken, orderEnded, readOrderToken } from "./state";
import type { useOnlineCart } from "./useOnlineCart";
import { deviceStorage } from "./useRestaurantLanguage";
import { useVerification } from "./useVerification";

// Always a button with the number on it, so customers see they can tap to call.
export function PhoneLink({
  phone,
  language,
  className,
}: {
  phone: string;
  language: Language;
  className?: string;
}) {
  return (
    <a href={`tel:${phone}`} className={cn(buttonVariants({ variant: "outline" }), className)}>
      <Phone aria-hidden="true" className="text-primary" />
      {onlineOrderMessages[language].callNumber(phone)}
    </a>
  );
}

function ServiceTag({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1 whitespace-nowrap">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      {children}
    </li>
  );
}

export function OnlineHeader({
  name,
  phone,
  delivery,
  language,
  selectLanguage,
  action,
}: {
  name: string;
  phone: string | null;
  // Whether delivery is offered next to pickup; the menu passes it, other pages leave the services out.
  delivery?: boolean;
  language: Language;
  selectLanguage: (value: Language) => void;
  action?: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  return (
    <RestaurantHeader
      name={name}
      language={language}
      selectLanguage={selectLanguage}
      details={
        delivery === undefined ? undefined : (
          <ul className="flex flex-wrap gap-2 text-sm font-medium">
            <ServiceTag icon={ShoppingBag}>{m.pickup}</ServiceTag>
            {delivery && <ServiceTag icon={Bike}>{m.delivery}</ServiceTag>}
          </ul>
        )
      }
      actions={phone ? <PhoneLink phone={phone} language={language} /> : undefined}
      refresh={action}
    />
  );
}

// Shared by the menu and cart sheet to explain disabled checkout.
export function OrderingContextNotice({
  model,
  language,
}: {
  model: ReturnType<typeof useOnlineCart>;
  language: Language;
}) {
  const m = onlineOrderMessages[language];
  return (
    <>
      {model.waitingOrder && (
        <Notice
          action={
            <Link
              to="/o/$token"
              params={{ token: model.waitingOrder.statusToken }}
              className={buttonVariants({ variant: "outline" })}
            >
              {m.viewOrder}
            </Link>
          }
        >
          {m.browserPending}
        </Notice>
      )}
      {model.contextFailed ? (
        <Notice
          tone="error"
          action={
            <Button
              variant="outline"
              disabled={model.contextRefreshing}
              onClick={model.refreshContext}
            >
              {m.retry}
            </Button>
          }
        >
          {m.contextFailed}
        </Notice>
      ) : model.contextChecking ? (
        <Notice>{m.contextChecking}</Notice>
      ) : null}
    </>
  );
}

// Reopening the menu points back to the latest order still in progress at this restaurant.
export function ActiveOrder({
  restaurantId,
  language,
}: {
  restaurantId: string;
  language: Language;
}) {
  const [token, setToken] = useState(() => {
    const storage = deviceStorage();
    return storage ? readOrderToken(restaurantId, storage) : null;
  });
  const query = useQuery({ ...onlineOrderQuery(token ?? ""), enabled: token !== null });
  const finished = query.data === null || (!!query.data && orderEnded(query.data));
  useEffect(() => {
    if (!token || !finished) return;
    const storage = deviceStorage();
    if (storage) clearOrderToken(restaurantId, storage);
    // The remembered order has ended or is gone: forget it.
    // oxlint-disable-next-line react/set-state-in-effect
    setToken(null);
  }, [token, finished, restaurantId]);
  if (!token || !query.data || finished) return null;
  const m = onlineOrderMessages[language];
  return (
    <Notice
      action={
        <Link to="/o/$token" params={{ token }} className={buttonVariants({ variant: "outline" })}>
          {m.viewOrder}
        </Link>
      }
    >
      {m.activeOrder}
    </Notice>
  );
}

// Business rejections the customer can act on are warnings; damage and storage problems are errors.
const messageTone = (message: OnlineOrderMessage): NoticeTone =>
  message === "storage" || message === "damaged" ? "error" : "warning";

// The result of the last action and any storage problem. A pending submission's own notice carries
// the phone, so these leave it out then.
export function MessageNotices({
  model,
  language,
  callAction,
}: {
  model: ReturnType<typeof useOnlineCart>;
  language: Language;
  callAction: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  return (
    <>
      {model.message && model.message !== "browserPending" && (
        <Notice
          tone={messageTone(model.message)}
          action={model.cart.pending ? undefined : callAction}
        >
          {m[model.message]}
        </Notice>
      )}
      {model.blocked && model.message !== model.blocked && (
        <Notice tone="error">{m[model.blocked]}</Notice>
      )}
    </>
  );
}

// A submission whose result is unknown: the cart stays locked until a GET finds the original, and only
// an explicit retry resends the same request.
export function PendingNotice({
  model,
  language,
  retry,
  callAction,
}: {
  model: ReturnType<typeof useOnlineCart>;
  language: Language;
  retry: () => void;
  callAction: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  return (
    <Notice
      tone="warning"
      action={
        <>
          <Button variant="outline" disabled={model.busy} onClick={() => void model.recover()}>
            {m.lookup}
          </Button>
          <Button variant="outline" disabled={model.busy || !!model.blocked} onClick={retry}>
            {m.retryOriginal}
          </Button>
          {callAction}
        </>
      }
    >
      {m.unknown}
    </Notice>
  );
}

// The amounts above the footer's button, shared by the cart and the checkout page; the last line is what
// the customer pays. Before a delivery fee is known it is the items total.
export function AmountLines({
  model,
  language,
}: {
  model: ReturnType<typeof useOnlineCart>;
  language: Language;
}) {
  const m = onlineOrderMessages[language];
  const { coupon, itemsCents, discountCents, totalCents, deliveryFeeCents, payableCents } =
    model.amounts;
  const delivery = model.form.fulfillment === "DELIVERY";
  return (
    <div className="space-y-1">
      {coupon && (
        <>
          <p className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
            <span>{m.subtotal}</span>
            <span className="tabular-nums">{formatMoney(itemsCents, language)}</span>
          </p>
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 wrap-break-word">
              {m.couponApplied(coupon.code, coupon.percentOff)}
            </span>
            <span className="shrink-0 tabular-nums">−{formatMoney(discountCents, language)}</span>
          </p>
        </>
      )}
      {deliveryFeeCents !== null && (
        <>
          <p className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
            <span>{m.itemsTotal}</span>
            <span className="tabular-nums">{formatMoney(totalCents, language)}</span>
          </p>
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span>{m.deliveryFee}</span>
            <span className="tabular-nums">{formatMoney(deliveryFeeCents, language)}</span>
          </p>
        </>
      )}
      <p className="flex items-baseline justify-between gap-3 text-lg font-semibold">
        <span>
          {deliveryFeeCents === null && model.review && delivery ? m.itemsTotal : m.total}
        </span>
        <span className="text-xl tabular-nums">{formatMoney(payableCents, language)}</span>
      </p>
    </div>
  );
}

// The cart and any pending submission. Rendered once: a side column on wide screens, a bottom sheet on
// phones (which passes its close button as headerAction). Checkout opens its own page.
export function OnlineCartPanel({
  cart: model,
  data,
  language,
  checkout,
  closedNotice,
  headerAction,
}: {
  cart: ReturnType<typeof useOnlineCart>;
  data: OnlineMenu;
  language: Language;
  checkout: () => void;
  // Why the restaurant cannot take orders right now, or null while it can.
  closedNotice: string | null;
  headerAction?: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  const phone = data.restaurant.publicPhone;
  const callAction = phone ? <PhoneLink phone={phone} language={language} /> : undefined;
  const verification = useVerification(model, data, language, callAction ?? null);
  const pending = model.cart.pending;
  const lines = model.cart.lines;
  const minOrderCents = data.restaurant.deliveryMinOrderCents;
  // Results of the footer's actions show beside them; while a submission is unresolved they belong
  // with the lookup and retry actions in the body instead.
  const footer = lines.length > 0;
  const noticesInFooter = footer && !pending;
  const notices = <MessageNotices model={model} language={language} callAction={callAction} />;
  // A fixed head and footer around a scrolling body, like the option picker: the total and the next
  // step stay in reach however long the cart grows. The sheet and the wide column only bound the
  // height; padding is the panel's own (the sheet exists below lg, the column from lg).
  return (
    <section id="cart" aria-labelledby="cart-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 px-4 pt-5 pb-3 lg:px-5">
        <h2 id="cart-title" className="min-w-0 flex-1 text-lg font-semibold">
          {m.cart}
        </h2>
        {headerAction}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 lg:px-5",
          footer ? "pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-5",
        )}
      >
        {!noticesInFooter && notices}
        <OrderingContextNotice model={model} language={language} />
        {pending && verification.challenge}
        {pending && (
          <PendingNotice
            model={model}
            language={language}
            retry={() => void verification.submit(true)}
            callAction={callAction}
          />
        )}
        {!lines.length ? (
          <EmptyCart label={m.empty} />
        ) : (
          <CartLines
            lines={lines}
            editable={!pending}
            frozen={model.busy || !!pending}
            menu={data.menu}
            defaultLanguage={data.restaurant.defaultLanguage}
            language={language}
            change={model.line}
          />
        )}
        {lines.length > 0 && !pending && (
          <p className="text-xs leading-5 text-muted-foreground">{m.cartHint}</p>
        )}
      </div>
      {footer && (
        <div className="space-y-3 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-5 lg:pb-5">
          {noticesInFooter && notices}
          <AmountLines model={model} language={language} />
          {model.minOrderShortfall > 0 && minOrderCents !== null && (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">
              {m.minOrderShort(
                formatMoney(minOrderCents, language),
                formatMoney(model.minOrderShortfall, language),
              )}
            </p>
          )}
          {!pending && (
            <>
              {closedNotice && (
                <p className="text-sm leading-6 text-muted-foreground">{closedNotice}</p>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={
                  model.busy || !!model.blocked || model.checkoutBlocked || closedNotice !== null
                }
                onClick={checkout}
              >
                {model.busy ? m.working : m.checkout}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
