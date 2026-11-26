import type { ReactNode } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { pickupMessages } from "@/features/online/pickup-messages";
import { formatMoney } from "@/lib/format";
import type { OnlineCheckoutContextValue } from "./checkout-context";
import { onlineOrderMessages } from "./messages";
import { AmountLines, MessageNotices, OrderingContextNotice } from "./OnlineViews";
import { checkoutBlock, type FeeStatus } from "./state";

export function CheckoutFooter({
  checkout,
  callAction,
  fee,
  verifying,
  next,
  reselectPickup,
}: {
  checkout: OnlineCheckoutContextValue;
  callAction: ReactNode;
  fee: FeeStatus;
  verifying: boolean;
  next: () => void;
  reselectPickup: () => void;
}) {
  const { cart: model, data, language, leave } = checkout;
  const m = onlineOrderMessages[language];
  const pickupCopy = pickupMessages[language];
  const minOrderCents = data.restaurant.deliveryMinOrderCents;
  const pending = model.cart.pending;
  const stalePickup = model.pickupIssue === "unavailable";
  const block = checkoutBlock({
    live: model.live,
    contextReady: model.contextReady,
    fee,
    shortfallCents: model.minOrderShortfall,
    amountTooLarge: model.amounts.payableCents === null,
    settling: model.settling,
    verifying,
  });
  const pickup = (
    <Button variant="outline" onClick={() => model.editPickup({ fulfillment: "PICKUP" })}>
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
  else if (block === "amount") reason = <Notice tone="error">{m.amount}</Notice>;
  else if (block === "verifying")
    reason = (
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {m.verifying}
      </p>
    );
  else if (block === null && fee === "UNKNOWN")
    reason = <Notice tone="warning">{m.quoteUnknown}</Notice>;

  return (
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
              <Button variant="outline" onClick={reselectPickup}>
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
            {model.busy ? m.working : fee === "lookup" ? m.lookupFee : m.placeOrder}
          </Button>
        )}
      </div>
    </footer>
  );
}
