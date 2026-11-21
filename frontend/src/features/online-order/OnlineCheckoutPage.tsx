import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bike, ShoppingBag } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickupMessages } from "@/features/online/pickup-messages";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatKm, formatMoney } from "@/lib/format";
import type { Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import { CartLines } from "@/features/orders/OrderViews";
import { reveal } from "@/features/menu/form-values";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import type { OnlineMenu } from "./api";
import { useOnlineCheckout, type OnlineCheckoutContextValue } from "./checkout-context";
import { onlineOrderMessages } from "./messages";
import { PickupTimeField } from "./PickupTimeField";
import {
  AmountLines,
  MessageNotices,
  OrderingContextNotice,
  PendingNotice,
  PhoneLink,
} from "./OnlineViews";
import {
  checkoutBlock,
  checkoutProblems,
  deliveryNote,
  feeRange,
  MAX_ADDRESS_LENGTH,
  MAX_DELIVERY_NOTES_LENGTH,
  MAX_NAME_LENGTH,
  nextCheckoutField,
  type AddressQuote,
  type CheckoutProblem,
  type FeeStatus,
  type Fulfillment,
} from "./state";
import { useVerification } from "./useVerification";

// The /r/{slug}/checkout page. The menu page holds the cart and sends a reload or a saved link without
// a reviewed cart back to the menu, so this renders nothing then.
export function OnlineCheckoutRoute() {
  const value = useOnlineCheckout();
  if (!value?.cart.review) return null;
  return <OnlineCheckout {...value} />;
}

// What the customer is about to order, the fulfillment and contact details, and below a footer with the
// amounts, the one reason the order cannot go yet and the button that takes the next step. The page
// scrolls like any other, so a phone keyboard opens and closes over it without moving anything else.
function OnlineCheckout({
  cart: model,
  data,
  slug,
  language,
  selectLanguage,
  leave,
}: OnlineCheckoutContextValue) {
  const m = onlineOrderMessages[language];
  const pickupCopy = pickupMessages[language];
  const phone = data.restaurant.publicPhone;
  const callAction = phone ? <PhoneLink phone={phone} language={language} /> : undefined;
  // In the form the footer says a check is running, and the widget shows its tick, so the challenge
  // keeps quiet; a pending submission's retry has no footer reason, so it speaks there.
  const verification = useVerification(
    model,
    data,
    language,
    callAction ?? null,
    !model.cart.pending,
  );
  // Field problems show once the customer tries the button: for the fee only the address counts.
  const [tried, setTried] = useState<"lookup" | "order" | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponText, setCouponText] = useState("");
  // The code last tried: a refusal shows under the field until the code is edited.
  const [couponTried, setCouponTried] = useState("");
  const couponRefused = model.message === "couponInvalid" && couponText === couponTried;
  // The refusal appears under the field, which may sit right above the sticky footer: bring it up.
  useEffect(() => {
    if (couponRefused)
      document
        .getElementById("online-coupon-problem")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [couponRefused]);
  const addressRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const couponRef = useRef<HTMLInputElement>(null);
  const pickupTimeRef = useRef<HTMLFieldSetElement>(null);
  const fields = { address: addressRef, notes: notesRef, name: nameRef, phone: phoneRef };
  const pending = model.cart.pending;
  const lines = model.review?.lines ?? model.cart.lines;
  const form = model.form;
  const delivery = form.fulfillment === "DELIVERY";
  const stalePickup = model.pickupIssue === "unavailable";
  // A choice of delivery stays visible if delivery is turned off meanwhile; the server then refuses it.
  const offersDelivery = data.restaurant.deliveryEnabled || delivery;
  const fee: FeeStatus = delivery ? model.feeStatus : "manual";
  const needsLookup = fee === "lookup";
  const minOrderCents = data.restaurant.deliveryMinOrderCents;
  const problems = checkoutProblems(form);
  const shown = (problem: CheckoutProblem) =>
    problems.includes(problem) &&
    (tried === "order" || (tried === "lookup" && problem === "address"));
  const block = checkoutBlock({
    live: model.live,
    contextReady: model.contextReady,
    fee,
    shortfallCents: model.minOrderShortfall,
    settling: model.settling,
    verifying: verification.verifying,
  });
  const choose = (fulfillment: Fulfillment) => model.editPickup({ fulfillment });

  // The footer's button takes the next step: a delivery not yet priced asks for its fee (only the
  // address has to be valid for that), then the same button places the order. A field to fix comes
  // to the middle of the screen, clear of the sticky footer, and takes the focus.
  function next() {
    if (stalePickup) return;
    if (needsLookup) {
      if (problems.includes("address")) {
        setTried((value) => value ?? "lookup");
        reveal(addressRef.current);
        return;
      }
      void model.lookupFee();
      return;
    }
    setTried("order");
    if (model.pickupIssue === "missing") {
      reveal(pickupTimeRef.current);
      return;
    }
    if (problems.length) {
      reveal(fields[problems[0]].current);
      return;
    }
    void verification.submit(false);
  }

  // Enter never places the order: in the address it asks for the fee (closing the keyboard, so the
  // answer above the button shows), elsewhere it moves to the next field, and the last one only closes
  // the keyboard.
  function enter(field: CheckoutProblem) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      // Enter first confirms an input method's composition (Chinese, Japanese).
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (field === "address" && needsLookup) {
        if (problems.includes("address")) {
          setTried((value) => value ?? "lookup");
          return;
        }
        event.currentTarget.blur();
        void model.lookupFee();
        return;
      }
      const target = nextCheckoutField(form.fulfillment, field);
      if (target) fields[target].current?.focus();
      else event.currentTarget.blur();
    };
  }

  function applyCoupon() {
    setCouponTried(couponText);
    void model.applyCoupon(couponText);
  }

  const pickup = (
    <Button variant="outline" onClick={() => choose("PICKUP")}>
      {m.switchToPickup}
    </Button>
  );
  // The one reason the button cannot be tapped, right above it; a fee the restaurant still has to
  // confirm is said there too, though the order can go.
  let reason: ReactNode = null;
  if (block === "offline") reason = <Notice tone="warning">{m.offlineNow}</Notice>;
  else if (block === "context")
    reason = <OrderingContextNotice model={model} language={language} />;
  else if (block === "outOfRange")
    reason = (
      <Notice
        tone="warning"
        action={
          <>
            {pickup}
            {callAction}
          </>
        }
      >
        {/* Where the address was found, so a customer who meant another place can tell. */}
        {model.quote?.town ? m.outOfRangeTown(model.quote.town) : m.outOfRange}
      </Notice>
    );
  else if (block === "minOrder" && minOrderCents !== null)
    reason = (
      <Notice
        tone="warning"
        action={
          <>
            <Button variant="outline" onClick={() => leave(false)}>
              {m.addMore}
            </Button>
            {pickup}
          </>
        }
      >
        {m.minOrderShort(
          formatMoney(minOrderCents, language),
          formatMoney(model.minOrderShortfall, language),
        )}
      </Notice>
    );
  else if (block === "verifying")
    reason = (
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {m.verifying}
      </p>
    );
  else if (block === null && fee === "UNKNOWN")
    reason = <Notice tone="warning">{m.quoteUnknown}</Notice>;

  return (
    <div lang={language} className="flex min-h-dvh flex-col">
      <header className="border-b pt-safe">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            aria-label={m.back}
            disabled={model.busy}
            onClick={() => leave(true)}
          >
            <ArrowLeft />
          </Button>
          <h1 className="min-w-0 flex-1 text-lg leading-tight font-semibold wrap-break-word">
            {m.checkoutTitle}
          </h1>
          <LanguageToggle language={language} select={selectLanguage} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 pt-4 pb-6">
        {pending && (
          <MessageNotices
            model={model}
            language={language}
            callAction={callAction}
            except={["couponInvalid"]}
          />
        )}
        {pending && verification.challenge}
        {pending && (
          <PendingNotice
            model={model}
            language={language}
            retry={() => void verification.submit(true)}
            callAction={callAction}
          />
        )}
        <CartLines
          lines={lines}
          editable={false}
          frozen
          menu={data.menu}
          defaultLanguage={data.restaurant.defaultLanguage}
          language={language}
          change={model.line}
        />
        {!pending && (
          // Ordered by dependency: the fulfillment opens the address, which decides whether and for how
          // much the restaurant delivers; the contact details follow, and the coupon comes last because
          // it changes the total shown beside the button.
          <form
            className="space-y-4 border-t pt-4"
            noValidate
            onSubmit={(event) => event.preventDefault()}
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
                  onValueChange={(value) => choose(value as Fulfillment)}
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
                          {value === "DELIVERY" && minOrderCents !== null && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {m.minOrderOption(formatMoney(minOrderCents, language))}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
            {!delivery && (model.pickupCalendar || form.pickupDate || form.pickupTime) && (
              <PickupTimeField
                calendar={model.pickupCalendar}
                date={form.pickupDate}
                time={form.pickupTime}
                stale={stalePickup}
                showMissing={tried === "order" && model.pickupIssue === "missing"}
                busy={model.busy}
                language={language}
                fieldRef={pickupTimeRef}
                onChange={model.editPickup}
              />
            )}
            {delivery && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="online-address">{m.address}</Label>
                  <Input
                    id="online-address"
                    ref={addressRef}
                    autoComplete="street-address"
                    enterKeyHint={needsLookup ? "go" : "next"}
                    placeholder={m.addressPlaceholder}
                    maxLength={MAX_ADDRESS_LENGTH}
                    value={form.address}
                    disabled={model.busy}
                    aria-invalid={shown("address")}
                    aria-describedby={shown("address") ? "online-address-problem" : undefined}
                    onChange={(event) => model.setForm({ ...form, address: event.target.value })}
                    onKeyDown={enter("address")}
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
                    enterKeyHint="next"
                    maxLength={MAX_DELIVERY_NOTES_LENGTH}
                    value={form.notes}
                    disabled={model.busy}
                    aria-invalid={shown("notes")}
                    aria-describedby={shown("notes") ? "online-notes-problem" : undefined}
                    onChange={(event) => model.setForm({ ...form, notes: event.target.value })}
                    onKeyDown={enter("notes")}
                  />
                  {shown("notes") && (
                    <p id="online-notes-problem" className="text-sm text-destructive">
                      {m.deliveryNotesProblem}
                    </p>
                  )}
                </div>
                <DeliveryDetails
                  fee={fee}
                  quote={model.quote}
                  finalFee={model.amounts.deliveryFeeCents}
                  data={data}
                  language={language}
                />
              </>
            )}
            <div className={cn("space-y-4", delivery && "border-t pt-4")}>
              <div className="space-y-2">
                <Label htmlFor="online-name">{m.name}</Label>
                <Input
                  id="online-name"
                  ref={nameRef}
                  autoComplete="name"
                  enterKeyHint="next"
                  maxLength={MAX_NAME_LENGTH}
                  value={form.name}
                  disabled={model.busy}
                  aria-invalid={shown("name")}
                  aria-describedby={shown("name") ? "online-name-problem" : undefined}
                  onChange={(event) => model.setForm({ ...form, name: event.target.value })}
                  onKeyDown={enter("name")}
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
                  enterKeyHint="done"
                  maxLength={30}
                  value={form.phone}
                  disabled={model.busy}
                  aria-invalid={shown("phone")}
                  aria-describedby={shown("phone") ? "online-phone-problem" : "online-phone-hint"}
                  onChange={(event) => model.setForm({ ...form, phone: event.target.value })}
                  onKeyDown={enter("phone")}
                />
                {shown("phone") ? (
                  <p id="online-phone-problem" className="text-sm text-destructive">
                    {m.phoneProblem}
                  </p>
                ) : (
                  <p id="online-phone-hint" className="text-sm text-muted-foreground">
                    {m.phoneHint}
                  </p>
                )}
              </div>
            </div>
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
            ) : couponOpen ? (
              <div className="space-y-2">
                <Label htmlFor="online-coupon">{m.coupon}</Label>
                <div className="flex gap-2">
                  <Input
                    id="online-coupon"
                    ref={couponRef}
                    className="min-w-0 flex-1"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    maxLength={20}
                    value={couponText}
                    disabled={model.busy}
                    aria-invalid={couponRefused}
                    aria-describedby={couponRefused ? "online-coupon-problem" : undefined}
                    onChange={(event) => setCouponText(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      // Enter applies the code; it never places the order.
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
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
                {couponRefused && (
                  <p id="online-coupon-problem" role="alert" className="text-sm text-destructive">
                    {m.couponInvalid}
                  </p>
                )}
              </div>
            ) : (
              // Most customers have no code, so the field stays out of the way until asked for.
              <Button
                type="button"
                variant="link"
                className="-ml-4"
                disabled={model.busy}
                onClick={() => {
                  setCouponOpen(true);
                  requestAnimationFrame(() => couponRef.current?.focus());
                }}
              >
                {m.couponToggle}
              </Button>
            )}
            {(delivery || (!form.pickupDate && !form.pickupTime)) && (
              <p className="text-sm leading-6 text-muted-foreground">
                {delivery ? m.asapDelivery : m.asap}
              </p>
            )}
            <p className="text-xs leading-5 wrap-break-word text-muted-foreground">
              {(delivery ? m.privacyLineDelivery : m.privacyLine)(data.restaurant.name)}{" "}
              <Link to="/r/$slug/privacy" params={{ slug }} className="underline">
                {m.privacy}
              </Link>
            </p>
            {/* Last in the body, right above the button it unlocks. */}
            {verification.challenge}
          </form>
        )}
      </main>
      <footer className="sticky bottom-0 z-10 border-t bg-background">
        <div className="mx-auto max-w-xl space-y-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* A refused coupon shows under its own field instead. */}
          {!pending && (
            <MessageNotices
              model={model}
              language={language}
              callAction={callAction}
              except={["couponInvalid", "pickupSlotChanged"]}
            />
          )}
          {!pending && stalePickup && (
            <Notice
              tone="error"
              action={
                <Button variant="outline" onClick={() => reveal(pickupTimeRef.current)}>
                  {pickupCopy.reselectTime}
                </Button>
              }
            >
              <span id="online-pickup-problem">{pickupCopy.chooseAgain}</span>
            </Notice>
          )}
          <AmountLines model={model} language={language} />
          {!pending && reason}
          {!pending && (
            <Button
              size="lg"
              className="w-full"
              disabled={model.busy || !!model.blocked || block !== null || stalePickup}
              onClick={next}
            >
              {model.busy ? m.working : needsLookup ? m.lookupFee : m.placeOrder}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

// Under the address: what the delivery costs. Before an automatic quote, one line on how the fee is
// worked out and its range; a quote as a result to check against the town; otherwise (no automatic
// quotes, or the address could not be priced or is too far) the full price list. The restaurant's
// note and the map credits follow.
function DeliveryDetails({
  fee,
  quote,
  finalFee,
  data,
  language,
}: {
  fee: FeeStatus;
  quote: AddressQuote | null;
  finalFee: number | null;
  data: OnlineMenu;
  language: Language;
}) {
  const m = onlineOrderMessages[language];
  const tiers = data.restaurant.deliveryTiers;
  const range = feeRange(tiers);
  const note = deliveryNote(data.restaurant, language);
  const money = (cents: number) => (cents === 0 ? m.free : formatMoney(cents, language));
  return (
    <div className="space-y-3 text-sm leading-6">
      {fee === "QUOTED" && quote && finalFee !== null && (
        <Notice tone="success">
          <span className="block font-medium wrap-break-word">
            {[
              quote.town && m.quotedTown(quote.town),
              quote.distanceMeters !== null && formatKm(quote.distanceMeters, language),
              finalFee === 0 ? m.free : m.quotedFee(formatMoney(finalFee, language)),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {quote.town && (
            <span className="block wrap-break-word">{m.quoteTownCheck(quote.town)}</span>
          )}
        </Notice>
      )}
      {fee === "lookup" && (
        <p className="text-muted-foreground">
          {m.quoteHint}
          {range && (
            <span className="block">
              {/* A range reads as amounts ("€ 0.00–€ 5.00"); "free" only when every band is. */}
              {m.feeSummary(
                range.minCents === range.maxCents
                  ? money(range.minCents)
                  : `${formatMoney(range.minCents, language)}–${formatMoney(range.maxCents, language)}`,
                formatKm(range.maxMeters, language),
              )}
            </span>
          )}
        </p>
      )}
      {fee !== "QUOTED" && fee !== "lookup" && tiers.length > 0 && (
        <div>
          <p className="font-medium">{m.feeTitle}</p>
          <ul>
            {tiers.map((tier) => (
              <li key={tier.maxMeters} className="flex items-baseline justify-between gap-3">
                <span>{m.tierLine(formatKm(tier.maxMeters, language))}</span>
                <span className="shrink-0 tabular-nums">{money(tier.feeCents)}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            {m.beyondTiers(formatKm(tiers[tiers.length - 1].maxMeters, language))}
          </p>
          {fee === "manual" && <p className="text-muted-foreground">{m.feeConfirmed}</p>}
        </div>
      )}
      {note && (
        <div>
          <p className="font-medium">{m.deliveryNoteTitle}</p>
          <p lang={note.language} className="whitespace-pre-wrap wrap-break-word">
            {note.text}
          </p>
        </div>
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
  );
}
