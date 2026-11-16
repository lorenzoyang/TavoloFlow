import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { Notice, type NoticeTone } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatMoney } from "@/lib/format";
import type { Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { CartLines } from "@/features/orders/OrderViews";
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

export function OnlineHeader({
  name,
  phone,
  subtitle,
  language,
  selectLanguage,
  action,
}: {
  name: string;
  phone: string | null;
  subtitle?: string;
  language: Language;
  selectLanguage: (value: Language) => void;
  action?: ReactNode;
}) {
  return (
    <header className="border-b bg-card pt-safe">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="font-display text-2xl leading-tight font-semibold wrap-break-word">
            {name}
          </h1>
          {subtitle && (
            <p className="mt-1 font-medium text-muted-foreground wrap-break-word">{subtitle}</p>
          )}
          {phone && <PhoneLink phone={phone} language={language} className="mt-3" />}
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle language={language} select={selectLanguage} />
          {action}
        </div>
      </div>
    </header>
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
  const { coupon, itemsCents, discountCents, totalCents } = model.amounts;
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
    void submitVerified(false);
  }
  return (
    <section id="cart" aria-labelledby="cart-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cart-title" className="text-lg font-semibold">
            {model.review ? m.checkoutTitle : m.cart}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {model.review
              ? data.restaurant.deliveryEnabled
                ? m.pickupOrDelivery
                : m.pickupOnly
              : m.cartHint}
          </p>
        </div>
        {headerAction}
      </div>
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
      <OrderingContextNotice model={model} language={language} />
      {pending && challenge}
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
        <p className="py-6 text-center text-muted-foreground">{m.empty}</p>
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
      {lines.length > 0 && (
        <div className="space-y-1 border-t pt-4">
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
          <p className="flex items-baseline justify-between gap-3 text-lg font-semibold">
            <span>{model.review && delivery ? m.itemsTotal : m.total}</span>
            <span className="text-xl tabular-nums">{formatMoney(totalCents, language)}</span>
          </p>
        </div>
      )}
      {lines.length > 0 && !pending && model.review && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            place();
          }}
        >
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
                {(["PICKUP", "DELIVERY"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
                  >
                    <RadioGroupItem value={value} />
                    {value === "PICKUP" ? m.pickup : m.delivery}
                  </label>
                ))}
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
                {m.phoneHint}
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
              <div className="space-y-1 rounded-xl border p-3 text-sm leading-6">
                {note && (
                  <>
                    <p className="font-medium">{m.deliveryNoteTitle}</p>
                    <p lang={note.language} className="whitespace-pre-wrap wrap-break-word">
                      {note.text}
                    </p>
                  </>
                )}
                <p className="text-muted-foreground">{m.feeConfirmed}</p>
              </div>
            </>
          )}
          <p className="rounded-xl bg-secondary p-3 text-sm leading-6">
            {delivery ? m.asapDelivery : m.asap}
          </p>
          {challenge}
          <div className="grid gap-2">
            <Button
              type="submit"
              size="lg"
              disabled={
                model.busy || !!model.blocked || model.checkoutBlocked || (!!siteKey && !token)
              }
            >
              {model.busy ? m.working : m.placeOrder}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={model.busy}
              onClick={model.back}
            >
              {m.back}
            </Button>
          </div>
          <p className="text-xs leading-5 wrap-break-word text-muted-foreground">
            {(delivery ? m.privacyLineDelivery : m.privacyLine)(data.restaurant.name)}{" "}
            <Link to="/r/$slug/privacy" params={{ slug }} className="underline">
              {m.privacy}
            </Link>
          </p>
        </form>
      )}
      {lines.length > 0 && !pending && !model.review && (
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
    </section>
  );
}
