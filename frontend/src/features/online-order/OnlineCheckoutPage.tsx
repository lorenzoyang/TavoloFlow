import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CartLines } from "@/features/orders/OrderViews";
import { reveal } from "@/features/menu/form-values";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { useOnlineCheckout, type OnlineCheckoutContextValue } from "./checkout-context";
import { onlineOrderMessages } from "./messages";
import { MessageNotices, PendingNotice, PhoneLink } from "./OnlineViews";
import { checkoutProblems, nextCheckoutField, type CheckoutProblem, type FeeStatus } from "./state";
import { useVerification } from "./useVerification";
import { FulfillmentFields, ContactFields } from "./CheckoutFields";
import { CheckoutFooter } from "./CheckoutFooter";

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
function OnlineCheckout(checkout: OnlineCheckoutContextValue) {
  const { cart: model, data, language, selectLanguage, slug, leave } = checkout;
  const m = onlineOrderMessages[language];
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
  const fee: FeeStatus = delivery ? model.feeStatus : "manual";
  const needsLookup = fee === "lookup";
  const problems = checkoutProblems(form);
  const shown = (problem: CheckoutProblem) =>
    problems.includes(problem) &&
    (tried === "order" || (tried === "lookup" && problem === "address"));

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
            <FulfillmentFields
              checkout={checkout}
              pickupTimeRef={pickupTimeRef}
              triedOrder={tried === "order"}
            />
            <ContactFields
              checkout={checkout}
              fields={fields}
              shown={shown}
              enter={enter}
              fee={fee}
            />
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
      <CheckoutFooter
        checkout={checkout}
        callAction={callAction}
        fee={fee}
        verifying={verification.verifying}
        next={next}
        reselectPickup={() => reveal(pickupTimeRef.current)}
      />
    </div>
  );
}
