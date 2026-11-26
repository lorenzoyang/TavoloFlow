import type { KeyboardEvent, RefObject } from "react";
import { Bike, ShoppingBag } from "lucide-react";
import { Notice } from "@/components/notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatKm, formatMoney } from "@/lib/format";
import type { Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import type { OnlineMenu } from "./api";
import type { OnlineCheckoutContextValue } from "./checkout-context";
import { onlineOrderMessages } from "./messages";
import { PickupTimeField } from "./PickupTimeField";
import {
  deliveryNote,
  feeRange,
  MAX_ADDRESS_LENGTH,
  MAX_DELIVERY_NOTES_LENGTH,
  MAX_NAME_LENGTH,
  type AddressQuote,
  type CheckoutProblem,
  type FeeStatus,
  type Fulfillment,
} from "./state";

export function FulfillmentFields({
  checkout,
  pickupTimeRef,
  triedOrder,
}: {
  checkout: OnlineCheckoutContextValue;
  pickupTimeRef: RefObject<HTMLFieldSetElement | null>;
  triedOrder: boolean;
}) {
  const { cart: model, data, language } = checkout;
  const { form } = model;
  const m = onlineOrderMessages[language];
  const minOrderCents = data.restaurant.deliveryMinOrderCents;
  const delivery = form.fulfillment === "DELIVERY";
  const offersDelivery = data.restaurant.deliveryEnabled || delivery;
  return (
    <>
      {offersDelivery && (
        <div className="space-y-2">
          <p id="online-fulfillment" className="text-sm font-medium">
            {m.fulfillment}
          </p>
          <RadioGroup
            aria-labelledby="online-fulfillment"
            value={form.fulfillment}
            disabled={model.busy}
            onValueChange={(value) => model.editPickup({ fulfillment: value as Fulfillment })}
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
          stale={model.pickupIssue === "unavailable"}
          showMissing={triedOrder && model.pickupIssue === "missing"}
          busy={model.busy}
          language={language}
          fieldRef={pickupTimeRef}
          onChange={model.editPickup}
        />
      )}
    </>
  );
}

export function ContactFields({
  checkout,
  fields: { address: addressRef, notes: notesRef, name: nameRef, phone: phoneRef },
  shown,
  enter,
  fee,
}: {
  checkout: OnlineCheckoutContextValue;
  fields: Record<CheckoutProblem, RefObject<HTMLInputElement | null>>;
  shown: (field: CheckoutProblem) => boolean;
  enter: (field: CheckoutProblem) => (event: KeyboardEvent<HTMLInputElement>) => void;
  fee: FeeStatus;
}) {
  const { cart: model, data, language } = checkout;
  const form = model.form;
  const m = onlineOrderMessages[language];
  const delivery = form.fulfillment === "DELIVERY";
  return (
    <>
      {delivery && (
        <>
          <div className="space-y-2">
            <Label htmlFor="online-address">{m.address}</Label>
            <Input
              id="online-address"
              ref={addressRef}
              autoComplete="street-address"
              enterKeyHint={fee === "lookup" ? "go" : "next"}
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
    </>
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
