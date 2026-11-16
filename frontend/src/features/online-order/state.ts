// Pure online ordering rules for customers, node-tested: the tab's cart and its pending submission,
// the checkout form, the remembered status link and what the status page says.
import type { CouponPreview, OnlineMenu, OnlineOrder, OnlineSubmission } from "./api.ts";
import type { Language } from "../../lib/language.ts";
import { isUuid } from "../../lib/ids.ts";
import { normalizeCouponCode, normalizePhone, validCouponPercent } from "../online/state.ts";
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
// customer saw, which the server checks like a line's expected price; null without one.
export type OnlineIntent = {
  clientRequestId: string;
  fulfillment: Fulfillment;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  items: OrderLineInput[];
  coupon: CouponPreview | null;
};

// The online cart of one restaurant in this tab. A pending submission freezes the lines. Version 2:
// lines carry the dish's sale price and the pending intent its coupon; other versions are damaged.
export type OnlineCart = {
  version: 2;
  restaurantId: string;
  lines: CartLine[];
  pending: OnlineIntent | null;
};

// Beside the QR carts (tavoloflow:cart:{restaurantId}:{tableId}), never sharing one with them.
export const onlineCartKey = (restaurantId: string) => cartKey(restaurantId, "online");

export const emptyOnlineCart = (restaurantId: string): OnlineCart => ({
  version: 2,
  restaurantId,
  lines: [],
  pending: null,
});

export const MAX_NAME_LENGTH = 30;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_DELIVERY_NOTES_LENGTH = 100;

// coupon is the code the restaurant confirmed at checkout (readCoupon), not what is being typed.
export type CheckoutForm = {
  fulfillment: Fulfillment;
  name: string;
  phone: string;
  address: string;
  notes: string;
  coupon: CouponPreview | null;
};
export type CheckoutProblem = "name" | "phone" | "address" | "notes";

export const emptyCheckoutForm: CheckoutForm = {
  fulfillment: "PICKUP",
  name: "",
  phone: "",
  address: "",
  notes: "",
  coupon: null,
};

// The server's rounding (OnlineCoupons.DiscountCents): the percentage of the dishes, down to the cent.
export const couponDiscountCents = (itemsCents: number, percentOff: number) =>
  Number((BigInt(itemsCents) * BigInt(percentOff)) / 100n);

// The checkout panel and mobile bar share these amounts. A pending intent keeps its own coupon,
// including null; a form's coupon counts only while reviewing the order.
export function onlineCartAmounts(
  cart: OnlineCart,
  review: OnlineCart | null,
  form: Pick<CheckoutForm, "coupon">,
) {
  const itemsCents = totalCents(review?.lines ?? cart.lines);
  const coupon = cart.pending ? cart.pending.coupon : review ? form.coupon : null;
  const discountCents = coupon ? couponDiscountCents(itemsCents, coupon.percentOff) : 0;
  return { itemsCents, coupon, discountCents, totalCents: itemsCents - discountCents };
}

const validCoupon = (coupon: CouponPreview | null) =>
  coupon === null ||
  (normalizeCouponCode(coupon.code) === coupon.code && validCouponPercent(coupon.percentOff));

// The server's rules: a trimmed name of 1-30 characters and the shared phone rule; delivery also needs
// an address of 1-200 characters and takes optional notes of up to 100. Pickup ignores both.
export function checkoutProblems(form: CheckoutForm): CheckoutProblem[] {
  const name = form.name.trim();
  const address = form.address.trim();
  const delivery = form.fulfillment === "DELIVERY";
  return [
    ...(name.length < 1 || name.length > MAX_NAME_LENGTH ? (["name"] as const) : []),
    ...(normalizePhone(form.phone) === null ? (["phone"] as const) : []),
    ...(delivery && (address.length < 1 || address.length > MAX_ADDRESS_LENGTH)
      ? (["address"] as const)
      : []),
    ...(delivery && form.notes.trim().length > MAX_DELIVERY_NOTES_LENGTH
      ? (["notes"] as const)
      : []),
  ];
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
): OnlineIntent {
  validateCart(cart);
  const phone = normalizePhone(form.phone);
  if (!cart.lines.length || cart.pending || !isUuid(requestId) || !phone)
    throw new CartError("limits");
  if (form.fulfillment !== "PICKUP" && form.fulfillment !== "DELIVERY")
    throw new CartError("limits");
  if (checkoutProblems(form).length || !validCoupon(form.coupon)) throw new CartError("limits");
  const delivery = form.fulfillment === "DELIVERY";
  return {
    clientRequestId: requestId,
    fulfillment: form.fulfillment,
    customerName: form.name.trim(),
    customerPhone: phone,
    deliveryAddress: delivery ? form.address.trim() : null,
    deliveryNotes: delivery ? form.notes.trim() || null : null,
    items: intentItems(cart.lines),
    coupon: form.coupon && { code: form.coupon.code, percentOff: form.coupon.percentOff },
  };
}

// Reads the tab's saved cart. A pending submission must match its frozen lines exactly: damaged data
// must never become a new submission.
export function restoreOnlineCart(raw: string | null, restaurantId: string): OnlineCart {
  if (raw === null) return emptyOnlineCart(restaurantId);
  try {
    const value = JSON.parse(raw) as OnlineCart;
    if (value.version !== 2 || value.restaurantId !== restaurantId) throw new Error();
    const cart: OnlineCart = validateCart({
      version: 2,
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
          name: p.customerName ?? "",
          phone: p.customerPhone ?? "",
          address: p.deliveryAddress ?? "",
          notes: p.deliveryNotes ?? "",
          coupon: p.coupon ?? null,
        },
        p.clientRequestId,
      );
      if (
        JSON.stringify(expected) !==
        JSON.stringify({
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
  "ONLINE_PAUSED",
  "ONLINE_CLOSED",
  "ONLINE_BUSY",
  "ONLINE_NOT_OFFERED",
  "SERVICE_SUSPENDED",
  "DELIVERY_NOT_OFFERED",
  "COUPON_INVALID",
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
    ? { statusToken: v.statusToken, number: v.number, expiresAt: v.expiresAt }
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

// What the status page shows, from the server's phase and, once accepted, the session and its dishes.
export type OrderView =
  | "waiting"
  | "expired"
  | "rejected"
  | "preparing"
  | "ready"
  | "allCancelled"
  | "collected"
  | "closed";

type ViewInput = Pick<OnlineOrder, "phase" | "sessionStatus" | "closeReason" | "items">;

export function orderView(order: ViewInput): OrderView {
  if (order.phase === "WAITING") return "waiting";
  if (order.phase === "EXPIRED") return "expired";
  if (order.phase === "REJECTED") return "rejected";
  if (order.sessionStatus === "CLOSED")
    return order.closeReason === "PAID" ? "collected" : "closed";
  if (order.items.length > 0 && order.items.every((item) => item.status === "CANCELLED"))
    return "allCancelled";
  return order.items.some((item) => item.status === "NEW") ? "preparing" : "ready";
}

// Ended orders stop polling and no longer show as "in progress" on the menu.
export const orderEnded = (order: ViewInput) =>
  ["expired", "rejected", "collected", "closed"].includes(orderView(order));

// The message key of each state; pickup and delivery differ where the customer's next step does.
export type StatusCopy =
  | "waiting"
  | "expired"
  | "rejectedSoldOut"
  | "rejectedBusy"
  | "rejectedClosing"
  | "rejectedOutOfRange"
  | "rejectedNoReason"
  | "preparingPickup"
  | "preparingDelivery"
  | "readyPickup"
  | "readyDelivery"
  | "allCancelled"
  | "collectedPickup"
  | "collectedDelivery"
  | "closed";

export function statusCopy(
  order: ViewInput & Pick<OnlineOrder, "fulfillment" | "rejectReason">,
): StatusCopy {
  const view = orderView(order);
  const delivery = order.fulfillment === "DELIVERY";
  switch (view) {
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
      return delivery ? "collectedDelivery" : "collectedPickup";
    default:
      return view;
  }
}
