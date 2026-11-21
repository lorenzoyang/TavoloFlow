// Pure online ordering rules for customers, node-tested: the tab's cart and its pending submission,
// the checkout form, the remembered status link and what the status page says.
import type {
  CouponPreview,
  DeliveryQuote,
  OnlineMenu,
  OnlineOrder,
  OnlineSubmission,
} from "./api.ts";
import type { Language } from "../../lib/language.ts";
import { isUuid } from "../../lib/ids.ts";
import {
  deliveryFeeForTier,
  normalizeCouponCode,
  normalizePhone,
  validCouponPercent,
  type DeliveryTier,
} from "../online/state.ts";
import {
  CartError,
  cartKey,
  intentItems,
  restoreLines,
  totalCents,
  validateCart,
  type CartLine,
  type OrderLineInput,
} from "../orders/state.ts";

export type Fulfillment = "PICKUP" | "DELIVERY";

// What the tab sends; saved and read back before the POST, so a lost result is recovered by GET.
// The address and notes are delivery only and null for pickup. The coupon carries the percentage the
// customer saw, which the server checks like a line's expected price; null without one. The delivery
// quote is the signed fee the customer saw for this address, null when the restaurant confirms it.
export type OnlineIntent = {
  clientRequestId: string;
  fulfillment: Fulfillment;
  customerName: string;
  customerPhone: string;
  requestedPickupAt?: string;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  items: OrderLineInput[];
  coupon: CouponPreview | null;
  deliveryQuote: { quote: string; feeCents: number } | null;
};

// The online cart of one restaurant in this tab. A pending submission freezes the lines. Version 3:
// lines carry the dish's sale price and the pending intent its coupon and delivery quote; other
// versions are damaged.
export type OnlineCart = {
  version: 3;
  restaurantId: string;
  lines: CartLine[];
  pending: OnlineIntent | null;
};

// Beside the QR carts (tavoloflow:cart:{restaurantId}:{tableId}), never sharing one with them.
export const onlineCartKey = (restaurantId: string) => cartKey(restaurantId, "online");

export const emptyOnlineCart = (restaurantId: string): OnlineCart => ({
  version: 3,
  restaurantId,
  lines: [],
  pending: null,
});

export const MAX_NAME_LENGTH = 30;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_DELIVERY_NOTES_LENGTH = 100;

// coupon is the code the restaurant confirmed at checkout (readCoupon), not what is being typed.
// quote is the server's answer for the address it was asked about, which counts only while the
// address is still the same (currentQuote).
export type CheckoutForm = {
  fulfillment: Fulfillment;
  pickupTime?: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  coupon: CouponPreview | null;
  quote: AddressQuote | null;
};
export type AddressQuote = DeliveryQuote & { address: string };
export type CheckoutProblem = "name" | "phone" | "address" | "notes";

export const emptyCheckoutForm: CheckoutForm = {
  fulfillment: "PICKUP",
  name: "",
  phone: "",
  address: "",
  notes: "",
  coupon: null,
  quote: null,
};

// The server's rounding (OnlineCoupons.DiscountCents): the percentage of the dishes, down to the cent.
export const couponDiscountCents = (itemsCents: number, percentOff: number) =>
  Number((BigInt(itemsCents) * BigInt(percentOff)) / 100n);

type QuoteForm = Pick<CheckoutForm, "fulfillment" | "address" | "quote">;

// The fee lookup for the address now in the form; null when there is none or the address changed.
// The quote was asked for with the trimmed text the order sends, which the server binds it to, so
// any other change, spacing included, needs a new lookup.
export const currentQuote = (form: Pick<CheckoutForm, "address" | "quote">) =>
  form.quote && form.quote.address === form.address.trim() ? form.quote : null;

// What checkout says about the delivery fee for this address: the answer while automatic quotes
// apply, or "lookup" until it is asked for; without them "manual" (the restaurant confirms the fee).
// A fee already quoted stays either way, since the amounts and the order carry it.
export type FeeStatus = "manual" | "lookup" | DeliveryQuote["result"];
export function feeStatus(form: QuoteForm, autoQuote: boolean): FeeStatus {
  const result = currentQuote(form)?.result;
  if (result === "QUOTED") return result;
  return autoQuote ? (result ?? "lookup") : "manual";
}

// The signed distance for the current address and the final fee shown, or null.
function intentQuote(form: QuoteForm, finalFeeCents?: number): OnlineIntent["deliveryQuote"] {
  const quote = form.fulfillment === "DELIVERY" ? currentQuote(form) : null;
  return quote?.result === "QUOTED" && quote.quote && quote.feeCents !== null
    ? { quote: quote.quote, feeCents: finalFeeCents ?? quote.feeCents }
    : null;
}

// The checkout panel and mobile bar share these amounts. A pending intent keeps its own coupon and
// delivery fee, including none; a form's coupon and quoted fee count only while reviewing the order.
// totalCents is the dishes after the coupon, which the delivery minimum compares; payableCents adds
// the quoted fee.
export function onlineCartAmounts(
  cart: OnlineCart,
  review: OnlineCart | null,
  form: Pick<CheckoutForm, "coupon"> & QuoteForm,
  tier: DeliveryTier | null = null,
) {
  const itemsCents = totalCents(review?.lines ?? cart.lines);
  const coupon = cart.pending ? cart.pending.coupon : review ? form.coupon : null;
  const discountCents = coupon ? couponDiscountCents(itemsCents, coupon.percentOff) : 0;
  const total = itemsCents - discountCents;
  const deliveryFeeCents = cart.pending
    ? (cart.pending.deliveryQuote?.feeCents ?? null)
    : review && tier && form.fulfillment === "DELIVERY"
      ? deliveryFeeForTier(tier, total)
      : null;
  return {
    itemsCents,
    coupon,
    discountCents,
    totalCents: total,
    deliveryFeeCents,
    payableCents: total + (deliveryFeeCents ?? 0),
  };
}

export function quotedDeliveryTier(form: QuoteForm, tiers: readonly DeliveryTier[]) {
  const quote = form.fulfillment === "DELIVERY" ? currentQuote(form) : null;
  const meters = quote?.distanceMeters;
  return quote?.result === "QUOTED" && meters != null
    ? (tiers.find((tier) => meters <= tier.maxMeters) ?? null)
    : null;
}

// How much a delivery order still lacks to reach the minimum: 0 when it does or there is none. Pass
// onlineCartAmounts' total: during checkout it is the dishes after the coupon, which the server compares
// (OnlineDelivery.DiscountedItemsCents); the fee never counts.
export const deliveryShortfallCents = (totalCents: number, minOrderCents: number | null) =>
  minOrderCents === null ? 0 : Math.max(0, minOrderCents - totalCents);

const validQuote = (quote: OnlineIntent["deliveryQuote"]) =>
  quote === null ||
  (typeof quote.quote === "string" &&
    quote.quote.length > 0 &&
    quote.quote.length <= 4096 &&
    Number.isSafeInteger(quote.feeCents) &&
    quote.feeCents >= 0);

const validCoupon = (coupon: CouponPreview | null) =>
  coupon === null ||
  (normalizeCouponCode(coupon.code) === coupon.code && validCouponPercent(coupon.percentOff));

// The checkout fields in the order they appear: a delivery asks for the address first, right under
// the choice that opens it, because the address decides whether and for how much the restaurant
// delivers; the contact details follow.
export const checkoutFields = (fulfillment: Fulfillment): CheckoutProblem[] =>
  fulfillment === "DELIVERY" ? ["address", "notes", "name", "phone"] : ["name", "phone"];

// Where Enter moves from a field: the next one, or null on the last (which closes the keyboard).
// Enter never places the order.
export function nextCheckoutField(
  fulfillment: Fulfillment,
  field: CheckoutProblem,
): CheckoutProblem | null {
  const fields = checkoutFields(fulfillment);
  const index = fields.indexOf(field);
  return index >= 0 && index < fields.length - 1 ? fields[index + 1] : null;
}

// The server's rules: a trimmed name of 1-30 characters and the shared phone rule; delivery also needs
// an address of 1-200 characters and takes optional notes of up to 100. Pickup ignores both. The
// problems come in the fields' order, so the first one is where checkout puts the focus.
export function checkoutProblems(form: CheckoutForm): CheckoutProblem[] {
  const name = form.name.trim();
  const address = form.address.trim();
  const delivery = form.fulfillment === "DELIVERY";
  const problems = new Set<CheckoutProblem>([
    ...(name.length < 1 || name.length > MAX_NAME_LENGTH ? (["name"] as const) : []),
    ...(normalizePhone(form.phone) === null ? (["phone"] as const) : []),
    ...(delivery && (address.length < 1 || address.length > MAX_ADDRESS_LENGTH)
      ? (["address"] as const)
      : []),
    ...(delivery && form.notes.trim().length > MAX_DELIVERY_NOTES_LENGTH
      ? (["notes"] as const)
      : []),
  ]);
  return checkoutFields(form.fulfillment).filter((field) => problems.has(field));
}

// The lowest and highest band fee and the farthest distance, for the one-line summary checkout shows
// before an automatic quote; null without bands.
export function feeRange(tiers: readonly { maxMeters: number; feeCents: number }[]) {
  if (!tiers.length) return null;
  const fees = tiers.map((tier) => tier.feeCents);
  return {
    minCents: Math.min(...fees),
    maxCents: Math.max(...fees),
    maxMeters: Math.max(...tiers.map((tier) => tier.maxMeters)),
  };
}

// Why "Place order" cannot be tapped now, shown right above it; null when it can. The first reason
// wins: the browser must be live and the ordering context known, then the address must be in range
// and the dishes must reach the minimum. While the fee still has to be asked for, the same button asks
// for it, so nothing else blocks. A fee that has just appeared holds the button for a moment, so a
// repeated tap cannot place the order before the customer has seen it; then the security check.
export type CheckoutBlock =
  "offline" | "context" | "outOfRange" | "minOrder" | "settling" | "verifying";
export function checkoutBlock(state: {
  live: boolean;
  contextReady: boolean;
  fee: FeeStatus;
  shortfallCents: number;
  settling: boolean;
  verifying: boolean;
}): CheckoutBlock | null {
  if (!state.live) return "offline";
  if (!state.contextReady) return "context";
  if (state.fee === "OUT_OF_RANGE") return "outOfRange";
  if (state.shortfallCents > 0) return "minOrder";
  if (state.fee === "lookup") return null;
  if (state.settling) return "settling";
  if (state.verifying) return "verifying";
  return null;
}

// The restaurant's delivery note in the customer's language, falling back like dish descriptions:
// the restaurant's default language, then Italian, Chinese and English.
export function deliveryNote(
  restaurant: Pick<
    OnlineMenu["restaurant"],
    "defaultLanguage" | "deliveryNoteZh" | "deliveryNoteIt" | "deliveryNoteEn"
  >,
  language: Language,
): { text: string; language: Language } | null {
  const notes = {
    zh: restaurant.deliveryNoteZh,
    it: restaurant.deliveryNoteIt,
    en: restaurant.deliveryNoteEn,
  };
  const order = new Set<Language>([language, restaurant.defaultLanguage, "it", "zh", "en"]);
  for (const key of order) {
    const text = notes[key]?.trim();
    if (text) return { text, language: key };
  }
  return null;
}

export function createOnlineIntent(
  cart: OnlineCart,
  form: CheckoutForm,
  requestId: string,
  finalDeliveryFeeCents?: number,
): OnlineIntent {
  validateCart(cart);
  const phone = normalizePhone(form.phone);
  if (!cart.lines.length || cart.pending || !isUuid(requestId) || !phone)
    throw new CartError("limits");
  if (form.fulfillment !== "PICKUP" && form.fulfillment !== "DELIVERY")
    throw new CartError("limits");
  if (checkoutProblems(form).length || !validCoupon(form.coupon)) throw new CartError("limits");
  const deliveryQuote = intentQuote(form, finalDeliveryFeeCents);
  if (!validQuote(deliveryQuote)) throw new CartError("limits");
  const delivery = form.fulfillment === "DELIVERY";
  if (form.pickupTime !== undefined && (delivery || !validTime(form.pickupTime)))
    throw new CartError("limits");
  return {
    ...(form.pickupTime ? { requestedPickupAt: form.pickupTime } : {}),
    clientRequestId: requestId,
    fulfillment: form.fulfillment,
    customerName: form.name.trim(),
    customerPhone: phone,
    deliveryAddress: delivery ? form.address.trim() : null,
    deliveryNotes: delivery ? form.notes.trim() || null : null,
    items: intentItems(cart.lines),
    coupon: form.coupon && { code: form.coupon.code, percentOff: form.coupon.percentOff },
    deliveryQuote,
  };
}

const validTime = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

// Reads the tab's saved cart. A pending submission must match its frozen lines exactly: damaged data
// must never become a new submission.
export function restoreOnlineCart(raw: string | null, restaurantId: string): OnlineCart {
  if (raw === null) return emptyOnlineCart(restaurantId);
  try {
    const value = JSON.parse(raw) as OnlineCart;
    if (value.version !== 3 || value.restaurantId !== restaurantId) throw new Error();
    const cart: OnlineCart = validateCart({
      version: 3,
      restaurantId,
      lines: restoreLines(value.lines),
      pending: null,
    });
    if (value.pending !== null) {
      const p = value.pending;
      if (!p || !isUuid(p.clientRequestId)) throw new Error();
      const expected = createOnlineIntent(
        cart,
        {
          fulfillment: p.fulfillment,
          pickupTime: p.requestedPickupAt,
          name: p.customerName ?? "",
          phone: p.customerPhone ?? "",
          address: p.deliveryAddress ?? "",
          notes: p.deliveryNotes ?? "",
          coupon: p.coupon ?? null,
          quote: p.deliveryQuote
            ? {
                address: p.deliveryAddress ?? "",
                result: "QUOTED",
                town: null,
                distanceMeters: null,
                feeCents: p.deliveryQuote.feeCents,
                quote: p.deliveryQuote.quote,
              }
            : null,
        },
        p.clientRequestId,
      );
      if (
        JSON.stringify(expected) !==
        JSON.stringify({
          ...(p.requestedPickupAt === undefined ? {} : { requestedPickupAt: p.requestedPickupAt }),
          clientRequestId: p.clientRequestId,
          fulfillment: p.fulfillment,
          customerName: p.customerName,
          customerPhone: p.customerPhone,
          deliveryAddress: p.deliveryAddress,
          deliveryNotes: p.deliveryNotes,
          items: p.items?.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            expectedUnitPriceCents: l.expectedUnitPriceCents,
            remark: l.remark,
            optionIds: l.optionIds,
          })),
          coupon: p.coupon && { code: p.coupon.code, percentOff: p.coupon.percentOff },
          deliveryQuote: p.deliveryQuote && {
            quote: p.deliveryQuote.quote,
            feeCents: p.deliveryQuote.feeCents,
          },
        })
      )
        throw new Error();
      cart.pending = expected;
    }
    return cart;
  } catch {
    throw new CartError("damaged");
  }
}

type FailureDisposition = "editable" | "unknown";

// The server returns these only after its duplicate check, inside the transaction holding the restaurant's
// cross-day submission lock and the day's counter row: no request with that ID was stored, so a retry
// may free the cart too.
const rejectedAfterDuplicateCheck = [
  "MENU_CHANGED",
  "ONLINE_PICKUP_SLOT_CHANGED",
  "ONLINE_PAUSED",
  "ONLINE_CLOSED",
  "ONLINE_BUSY",
  "ONLINE_NOT_OFFERED",
  "SERVICE_SUSPENDED",
  "DELIVERY_NOT_OFFERED",
  "COUPON_INVALID",
  "DELIVERY_MIN_ORDER",
  "DELIVERY_QUOTE_INVALID",
  "DELIVERY_FEE_CHANGED",
  "ONLINE_BROWSER_PENDING",
  "ONLINE_IP_WAITING_LIMIT",
];

// Whether a failed submission frees the cart. Any understood rejection of a first attempt does. After an
// unknown result, a retry frees it only on a rejection that proves the original was never stored; the
// others (format, link, CSRF, rate limit) come before the duplicate check, so the intent stays.
export function submissionFailure(
  status: number | null,
  code: string | null,
  wasUnknown: boolean,
): FailureDisposition {
  if (status === null || status >= 500) return "unknown";
  if (rejectedAfterDuplicateCheck.includes(code ?? "")) return "editable";
  if (wasUnknown) return "unknown";
  return [
    "VALIDATION_FAILED",
    "ONLINE_LINK_NOT_FOUND",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
    "ONLINE_BROWSER_REQUIRED",
    "ONLINE_VERIFICATION_FAILED",
  ].includes(code ?? "")
    ? "editable"
    : "unknown";
}

// The status link of the customer's latest order at a restaurant, kept on the device so reopening the
// menu can point back to an order still in progress.
export const orderTokenKey = (restaurantId: string) => `tavoloflow:online-order:${restaurantId}`;

// A browser conflict points to another order; it must never clear this cart as a successful submission.
export function existingSubmission(value: unknown): OnlineSubmission | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.statusToken === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(v.statusToken) &&
    typeof v.number === "number" &&
    Number.isSafeInteger(v.number) &&
    v.number > 0 &&
    typeof v.expiresAt === "string" &&
    Number.isFinite(Date.parse(v.expiresAt))
    ? {
        statusToken: v.statusToken,
        number: v.number,
        expiresAt: v.expiresAt,
        ...(validTime(v.requestedPickupAt) ? { requestedPickupAt: v.requestedPickupAt } : {}),
      }
    : null;
}

export function readOrderToken(
  restaurantId: string,
  storage: Pick<Storage, "getItem">,
): string | null {
  try {
    const value = storage.getItem(orderTokenKey(restaurantId));
    return value && /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveOrderToken(
  restaurantId: string,
  token: string,
  storage: Pick<Storage, "setItem">,
) {
  try {
    storage.setItem(orderTokenKey(restaurantId), token);
  } catch {
    /* Storage can be unavailable; the status page link still works. */
  }
}

export function clearOrderToken(restaurantId: string, storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(orderTokenKey(restaurantId));
  } catch {
    /* Nothing to clear. */
  }
}

const reservationKey = (restaurantId: string) => `tavoloflow:pickup-reservations:${restaurantId}`;

export function readReservations(
  restaurantId: string,
  storage: Pick<Storage, "getItem">,
): (OnlineSubmission & { requestedPickupAt: string })[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(reservationKey(restaurantId)) ?? "[]");
    return Array.isArray(saved)
      ? saved
          .map(existingSubmission)
          .filter(
            (order): order is OnlineSubmission & { requestedPickupAt: string } =>
              !!order?.requestedPickupAt,
          )
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function rememberOnlineOrder(
  restaurantId: string,
  order: OnlineSubmission,
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  if (!order.requestedPickupAt) {
    saveOrderToken(restaurantId, order.statusToken, storage);
    return;
  }
  try {
    const previous = readReservations(restaurantId, storage);
    if (previous.some((item) => item.statusToken === order.statusToken)) return;
    storage.setItem(reservationKey(restaurantId), JSON.stringify([order, ...previous].slice(0, 5)));
  } catch {
    // The order page still has its direct URL.
  }
}

// What the status page shows, from the server's phase and, once accepted, the session and its dishes.
export type OrderView =
  | "waiting"
  | "expired"
  | "rejected"
  | "scheduled"
  | "preparing"
  | "ready"
  | "allCancelled"
  | "collected"
  | "closed";

type ViewInput = Pick<OnlineOrder, "phase" | "sessionStatus" | "closeReason" | "items"> &
  Partial<Pick<OnlineOrder, "awaitingPreparation">>;

export function orderView(order: ViewInput): OrderView {
  if (order.phase === "WAITING") return "waiting";
  if (order.phase === "EXPIRED") return "expired";
  if (order.phase === "REJECTED") return "rejected";
  if (order.sessionStatus === "CLOSED")
    return order.closeReason === "PAID" ? "collected" : "closed";
  if (order.items.length > 0 && order.items.every((item) => item.status === "CANCELLED"))
    return "allCancelled";
  if (order.awaitingPreparation) return "scheduled";
  return order.items.some((item) => item.status === "NEW") ? "preparing" : "ready";
}

// Ended orders stop polling and no longer show as "in progress" on the menu.
export const orderEnded = (order: ViewInput) =>
  ["expired", "rejected", "collected", "closed"].includes(orderView(order));

// How far an order going ahead has come: sent, accepted, ready. Nothing marks the handover reliably
// (pass taps are optional, the bill closes later), and the customer meets staff at that point, so the
// last step is ready; a collected order (`PAID`) shows every step done. Orders that did not go ahead,
// or closed without being collected, have no progress to show.
export type OrderStep = 0 | 1 | 2 | 3;
const steps: Partial<Record<OrderView, OrderStep>> = {
  waiting: 0,
  preparing: 1,
  scheduled: 1,
  ready: 2,
  collected: 3,
};
export const orderProgress = (view: OrderView): OrderStep | null => steps[view] ?? null;

// The message key of each state; pickup and delivery differ where the customer's next step does.
export type StatusCopy =
  | "waiting"
  | "expired"
  | "rejectedSoldOut"
  | "rejectedBusy"
  | "rejectedClosing"
  | "rejectedOutOfRange"
  | "rejectedNoReason"
  | "scheduled"
  | "preparingPickup"
  | "preparingDelivery"
  | "readyPickup"
  | "readyDelivery"
  | "allCancelled"
  | "completed"
  | "closed";

export function statusCopy(
  order: ViewInput & Pick<OnlineOrder, "fulfillment" | "rejectReason">,
): StatusCopy {
  const view = orderView(order);
  const delivery = order.fulfillment === "DELIVERY";
  switch (view) {
    case "scheduled":
      return "scheduled";
    case "rejected":
      return order.rejectReason === "SOLD_OUT"
        ? "rejectedSoldOut"
        : order.rejectReason === "BUSY"
          ? "rejectedBusy"
          : order.rejectReason === "CLOSING"
            ? "rejectedClosing"
            : order.rejectReason === "OUT_OF_RANGE"
              ? "rejectedOutOfRange"
              : "rejectedNoReason";
    case "preparing":
      return delivery ? "preparingDelivery" : "preparingPickup";
    case "ready":
      return delivery ? "readyDelivery" : "readyPickup";
    case "collected":
      return "completed";
    default:
      return view;
  }
}
