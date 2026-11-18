import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bike, Phone, ShoppingBag, type LucideIcon } from "lucide-react";
import { Notice, type NoticeTone } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatKm, formatMoney } from "@/lib/format";
import type { Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import { RestaurantHeader } from "@/features/public-menu/PublicMenuViews";
import { CartLines, EmptyCart } from "@/features/orders/OrderViews";
import { onlineOrderQuery, type OnlineMenu } from "./api";
import { onlineOrderMessages, type OnlineOrderMessage } from "./messages";
import {
  checkoutProblems,
  clearOrderToken,
  deliveryNote,
  MAX_ADDRESS_LENGTH,
  MAX_DELIVERY_NOTES_LENGTH,
  MAX_NAME_LENGTH,
  orderEnded,
  readOrderToken,
  type CheckoutProblem,
  type Fulfillment,
} from "./state";
import type { useOnlineCart } from "./useOnlineCart";
import { deviceStorage } from "./useRestaurantLanguage";
import { TurnstileChallenge } from "./TurnstileChallenge";
import {
  verificationBinding,
  verificationContext,
  verificationToken,
  type VerificationProof,
} from "./verification";

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

// The cart, its checkout form and any pending submission. Rendered once: a side column on wide
// screens, a bottom sheet on phones (which passes its close button as headerAction).
export function OnlineCartPanel({
  cart: model,
  data,
  slug,
  language,
  closedNotice,
  headerAction,
}: {
  cart: ReturnType<typeof useOnlineCart>;
  data: OnlineMenu;
  slug: string;
  language: Language;
  // Why the restaurant cannot take orders right now, or null while it can.
  closedNotice: string | null;
  headerAction?: ReactNode;
}) {
  const m = onlineOrderMessages[language];
  const [proof, setProof] = useState<VerificationProof | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const siteKey = data.turnstile?.siteKey ?? null;
  const binding =
    siteKey && model.verificationRequestId
      ? verificationBinding(data.restaurant.id, model.verificationRequestId)
      : null;
  const proofContext = siteKey && binding ? verificationContext(siteKey, binding, language) : "";
  const token = verificationToken(proof, proofContext);
  const resetVerification = () => {
    setProof(null);
    setVerificationAttempt((value) => value + 1);
  };
  async function submitVerified(retry: boolean) {
    try {
      await (retry ? model.retry(token) : model.confirm(token));
    } finally {
      resetVerification();
    }
  }
  const challenge =
    siteKey && binding ? (
      <TurnstileChallenge
        key={`${proofContext}:${verificationAttempt}`}
        siteKey={siteKey}
        binding={binding}
        language={language}
        onProof={setProof}
        retry={resetVerification}
        fallback={
          data.restaurant.publicPhone ? (
            <PhoneLink phone={data.restaurant.publicPhone} language={language} />
          ) : null
        }
      />
    ) : null;
  const [tried, setTried] = useState(false);
  const [couponText, setCouponText] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const pending = model.cart.pending;
  const lines = model.review?.lines ?? model.cart.lines;
  const frozen = model.busy || !!pending || !!model.review;
  const form = model.form;
  const problems = checkoutProblems(form);
  const shown = (problem: CheckoutProblem) => tried && problems.includes(problem);
  const phone = data.restaurant.publicPhone;
  const callAction = phone ? <PhoneLink phone={phone} language={language} /> : undefined;
  // A choice of delivery stays visible if delivery is turned off meanwhile; the server then refuses it.
  const offersDelivery = data.restaurant.deliveryEnabled || form.fulfillment === "DELIVERY";
  const delivery = form.fulfillment === "DELIVERY";
  const note = delivery ? deliveryNote(data.restaurant, language) : null;
  const { coupon, itemsCents, discountCents, totalCents, deliveryFeeCents, payableCents } =
    model.amounts;
  const fee = delivery ? model.feeStatus : "manual";
  const quote = model.quote;
  const needsLookup = fee === "lookup";
  const minOrderCents = data.restaurant.deliveryMinOrderCents;
  const tiers = data.restaurant.deliveryTiers;
  function applyCoupon() {
    void model.applyCoupon(couponText);
  }
  function place() {
    setTried(true);
    if (problems.length) {
      ({ name: nameRef, phone: phoneRef, address: addressRef, notes: notesRef })[
        problems[0]
      ].current?.focus();
      return;
    }
    // A delivery's fee is shown before the order goes out: the first tap asks for it.
    if (needsLookup) {
      void model.lookupFee();
      return;
    }
    void submitVerified(false);
  }
  // Results of the footer's actions show beside them; while a submission is unresolved they belong
  // with the lookup and retry actions in the body instead.
  const footer = lines.length > 0;
  const noticesInFooter = footer && !pending;
  const messageNotices = (
    <>
      {model.message && model.message !== "browserPending" && (
        <Notice
          tone={messageTone(model.message)}
          // The pending notice below carries the phone while a submission is unresolved.
          action={pending ? undefined : callAction}
        >
          {m[model.message]}
        </Notice>
      )}
      {model.blocked && model.message !== model.blocked && (
        <Notice tone="error">{m[model.blocked]}</Notice>
      )}
    </>
  );
  // A fixed head and footer around a scrolling body, like the option picker: the total and the next
  // step stay in reach however long the cart or the form grows. The sheet and the wide column only
  // bound the height; padding is the panel's own (the sheet exists below lg, the column from lg).
  return (
    <section id="cart" aria-labelledby="cart-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 px-4 pt-5 pb-3 lg:px-5">
        {model.review && !pending && (
          <Button
            variant="ghost"
            size="icon"
            className="-mt-2 -ml-2"
            aria-label={m.back}
            disabled={model.busy}
            onClick={model.back}
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="cart-title" className="text-lg font-semibold">
            {model.review ? m.checkoutTitle : m.cart}
          </h2>
          {model.review && (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.restaurant.deliveryEnabled ? m.pickupOrDelivery : m.pickupOnly}
            </p>
          )}
        </div>
        {headerAction}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 lg:px-5",
          footer ? "pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-5",
        )}
      >
        {!noticesInFooter && messageNotices}
        <OrderingContextNotice model={model} language={language} />
        {pending && challenge}
        {pending && (
          <Notice
            tone="warning"
            action={
              <>
                <Button
                  variant="outline"
                  disabled={model.busy}
                  onClick={() => void model.recover()}
                >
                  {m.lookup}
                </Button>
                <Button
                  variant="outline"
                  disabled={model.busy || !!model.blocked}
                  onClick={() => void submitVerified(true)}
                >
                  {m.retryOriginal}
                </Button>
                {callAction}
              </>
            }
          >
            {m.unknown}
          </Notice>
        )}
        {!lines.length ? (
          <EmptyCart label={m.empty} />
        ) : (
          <CartLines
            lines={lines}
            editable={!model.review && !pending}
            frozen={frozen}
            menu={data.menu}
            defaultLanguage={data.restaurant.defaultLanguage}
            language={language}
            change={model.line}
          />
        )}
        {lines.length > 0 && !pending && !model.review && (
          <p className="text-xs leading-5 text-muted-foreground">{m.cartHint}</p>
        )}
        {lines.length > 0 && !pending && model.review && (
          // Ordered by dependency: the fulfillment decides the address fields, and the coupon comes
          // last because it changes the total shown in the footer, beside the submit button.
          <form
            id="online-checkout"
            className="space-y-4 border-t pt-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              place();
            }}
          >
            {offersDelivery && (
              <div className="space-y-2">
                <p id="online-fulfillment" className="text-sm font-medium">
                  {m.fulfillment}
                </p>
                <RadioGroup
                  aria-labelledby="online-fulfillment"
                  value={form.fulfillment}
                  disabled={model.busy}
                  onValueChange={(value) =>
                    model.setForm({ ...form, fulfillment: value as Fulfillment })
                  }
                  className="grid-cols-2"
                >
                  {(["PICKUP", "DELIVERY"] as const).map((value) => {
                    const Icon = value === "PICKUP" ? ShoppingBag : Bike;
                    return (
                      <label
                        key={value}
                        className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
                      >
                        <RadioGroupItem value={value} />
                        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          {value === "PICKUP" ? m.pickup : m.delivery}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="online-name">{m.name}</Label>
              <Input
                id="online-name"
                ref={nameRef}
                autoComplete="name"
                maxLength={MAX_NAME_LENGTH}
                value={form.name}
                disabled={model.busy}
                aria-invalid={shown("name")}
                aria-describedby={shown("name") ? "online-name-problem" : undefined}
                onChange={(event) => model.setForm({ ...form, name: event.target.value })}
              />
              {shown("name") && (
                <p id="online-name-problem" className="text-sm text-destructive">
                  {m.nameProblem}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="online-phone">{m.phone}</Label>
              <Input
                id="online-phone"
                ref={phoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={30}
                value={form.phone}
                disabled={model.busy}
                aria-invalid={shown("phone")}
                aria-describedby={shown("phone") ? "online-phone-problem" : "online-phone-hint"}
                onChange={(event) => model.setForm({ ...form, phone: event.target.value })}
              />
              {shown("phone") ? (
                <p id="online-phone-problem" className="text-sm text-destructive">
                  {m.phoneProblem}
                </p>
              ) : (
                <p id="online-phone-hint" className="text-sm text-muted-foreground">
                  {m.phoneHint} <span className="block">{m.phoneForeignHint}</span>
                </p>
              )}
            </div>
            {delivery && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="online-address">{m.address}</Label>
                  <Input
                    id="online-address"
                    ref={addressRef}
                    autoComplete="street-address"
                    maxLength={MAX_ADDRESS_LENGTH}
                    value={form.address}
                    disabled={model.busy}
                    aria-invalid={shown("address")}
                    aria-describedby={shown("address") ? "online-address-problem" : undefined}
                    onChange={(event) => model.setForm({ ...form, address: event.target.value })}
                  />
                  {shown("address") && (
                    <p id="online-address-problem" className="text-sm text-destructive">
                      {m.addressProblem}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="online-notes">{m.deliveryNotes}</Label>
                  <Input
                    id="online-notes"
                    ref={notesRef}
                    maxLength={MAX_DELIVERY_NOTES_LENGTH}
                    value={form.notes}
                    disabled={model.busy}
                    aria-invalid={shown("notes")}
                    aria-describedby={shown("notes") ? "online-notes-problem" : undefined}
                    onChange={(event) => model.setForm({ ...form, notes: event.target.value })}
                  />
                  {shown("notes") && (
                    <p id="online-notes-problem" className="text-sm text-destructive">
                      {m.deliveryNotesProblem}
                    </p>
                  )}
                </div>
                <div className="space-y-2 rounded-xl border p-3 text-sm leading-6">
                  {fee === "QUOTED" && quote?.feeCents != null && (
                    <div>
                      <p className="font-medium wrap-break-word">
                        {quote.town
                          ? m.quotedTo(quote.town, formatMoney(quote.feeCents, language))
                          : m.quotedFee(formatMoney(quote.feeCents, language))}
                      </p>
                      <p className="text-muted-foreground">{m.quoteTownHint}</p>
                    </div>
                  )}
                  {fee === "OUT_OF_RANGE" && (
                    <div className="space-y-2">
                      <p className="font-medium">{m.outOfRange}</p>
                      {callAction}
                    </div>
                  )}
                  {fee === "UNKNOWN" && <p className="font-medium">{m.quoteUnknown}</p>}
                  {fee === "lookup" && <p className="text-muted-foreground">{m.quoteHint}</p>}
                  {(fee === "lookup" || fee === "UNKNOWN") && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={model.busy || !form.address.trim()}
                      onClick={() => void model.lookupFee()}
                    >
                      {m.lookupFee}
                    </Button>
                  )}
                  {fee !== "QUOTED" && tiers.length > 0 && (
                    <div>
                      <p className="font-medium">{m.feeTitle}</p>
                      <ul>
                        {tiers.map((tier) => (
                          <li
                            key={tier.maxMeters}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <span>{m.tierLine(formatKm(tier.maxMeters, language))}</span>
                            <span className="shrink-0 tabular-nums">
                              {tier.feeCents === 0 ? m.free : formatMoney(tier.feeCents, language)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted-foreground">
                        {m.beyondTiers(formatKm(tiers[tiers.length - 1].maxMeters, language))}
                      </p>
                    </div>
                  )}
                  {minOrderCents !== null && (
                    <p className="font-medium">
                      {m.minOrderLine(formatMoney(minOrderCents, language))}
                    </p>
                  )}
                  {note && (
                    <div>
                      <p className="font-medium">{m.deliveryNoteTitle}</p>
                      <p lang={note.language} className="whitespace-pre-wrap wrap-break-word">
                        {note.text}
                      </p>
                    </div>
                  )}
                  {(fee === "manual" || fee === "UNKNOWN") && (
                    <p className="text-muted-foreground">{m.feeConfirmed}</p>
                  )}
                  {(data.restaurant.deliveryAutoQuote || fee === "QUOTED") && (
                    <p className="text-xs text-muted-foreground">
                      <a
                        href="https://www.geoapify.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {m.attribution.geoapify}
                      </a>
                      {" · "}
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {m.attribution.osm}
                      </a>
                    </p>
                  )}
                </div>
              </>
            )}
            {form.coupon ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <p className="min-w-0 text-sm font-medium wrap-break-word">
                  {m.couponApplied(form.coupon.code, form.coupon.percentOff)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={model.busy}
                  onClick={() => {
                    model.removeCoupon();
                    setCouponText("");
                  }}
                >
                  {m.removeCoupon}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="online-coupon">{m.coupon}</Label>
                <div className="flex gap-2">
                  <Input
                    id="online-coupon"
                    className="min-w-0 flex-1"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={20}
                    value={couponText}
                    disabled={model.busy}
                    aria-describedby="online-coupon-hint"
                    onChange={(event) => setCouponText(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      // Enter applies the code instead of placing the order.
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (couponText.trim()) applyCoupon();
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={model.busy || !couponText.trim()}
                    onClick={applyCoupon}
                  >
                    {m.applyCoupon}
                  </Button>
                </div>
                <p id="online-coupon-hint" className="text-sm text-muted-foreground">
                  {m.couponHint}
                </p>
              </div>
            )}
            <p className="rounded-xl bg-secondary p-3 text-sm leading-6">
              {delivery ? m.asapDelivery : m.asap}
            </p>
            <p className="text-xs leading-5 wrap-break-word text-muted-foreground">
              {(delivery ? m.privacyLineDelivery : m.privacyLine)(data.restaurant.name)}{" "}
              <Link to="/r/$slug/privacy" params={{ slug }} className="underline">
                {m.privacy}
              </Link>
            </p>
            {/* Last in the body, right above the submit button it unlocks. */}
            {challenge}
          </form>
        )}
      </div>
      {footer && (
        <div className="space-y-3 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-5 lg:pb-5">
          {noticesInFooter && messageNotices}
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
                  <span className="shrink-0 tabular-nums">
                    −{formatMoney(discountCents, language)}
                  </span>
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
            {model.minOrderShortfall > 0 && minOrderCents !== null && (
              <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">
                {m.minOrderShort(
                  formatMoney(minOrderCents, language),
                  formatMoney(model.minOrderShortfall, language),
                )}
              </p>
            )}
          </div>
          {!pending && !model.review && (
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
                onClick={() => void model.checkout()}
              >
                {model.busy ? m.working : m.checkout}
              </Button>
            </>
          )}
          {!pending && model.review && (
            <Button
              type="submit"
              form="online-checkout"
              size="lg"
              className="w-full"
              disabled={
                model.busy ||
                !!model.blocked ||
                model.checkoutBlocked ||
                model.minOrderShortfall > 0 ||
                fee === "OUT_OF_RANGE" ||
                (!!siteKey && !token && !needsLookup)
              }
            >
              {model.busy ? m.working : needsLookup ? m.lookupFee : m.placeOrder}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
