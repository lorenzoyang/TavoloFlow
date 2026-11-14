// Pure online ordering rules for customers, node-tested: the tab's cart and its pending submission,
// the checkout form, the remembered status link and what the status page says.
import type { OnlineOrder } from "./api.ts";
import { isUuid } from "../../lib/ids.ts";
import { normalizePhone } from "../online/state.ts";
import {
  CartError,
  cartKey,
  intentItems,
  restoreLines,
  validateCart,
  type CartLine,
  type OrderLineInput,
} from "../orders/state.ts";

// What the tab sends; saved and read back before the POST, so a lost result is recovered by GET.
export type OnlineIntent = {
  clientRequestId: string;
  fulfillment: "PICKUP";
  customerName: string;
  customerPhone: string;
  items: OrderLineInput[];
};

// The online cart of one restaurant in this tab. A pending submission freezes the lines.
export type OnlineCart = {
  version: 1;
  restaurantId: string;
  lines: CartLine[];
  pending: OnlineIntent | null;
};

// Beside the QR carts (tavoloflow:cart:{restaurantId}:{tableId}), never sharing one with them.
export const onlineCartKey = (restaurantId: string) => cartKey(restaurantId, "online");

export const emptyOnlineCart = (restaurantId: string): OnlineCart => ({
  version: 1,
  restaurantId,
  lines: [],
  pending: null,
});

export const MAX_NAME_LENGTH = 30;

export type CheckoutForm = { name: string; phone: string };
export type CheckoutProblem = "name" | "phone";

// The server's rules: a trimmed name of 1-30 characters and the shared phone rule.
export function checkoutProblems(form: CheckoutForm): CheckoutProblem[] {
  const name = form.name.trim();
  return [
    ...(name.length < 1 || name.length > MAX_NAME_LENGTH ? (["name"] as const) : []),
    ...(normalizePhone(form.phone) === null ? (["phone"] as const) : []),
  ];
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
  if (checkoutProblems(form).length) throw new CartError("limits");
  return {
    clientRequestId: requestId,
    fulfillment: "PICKUP",
    customerName: form.name.trim(),
    customerPhone: phone,
    items: intentItems(cart.lines),
  };
}

// Reads the tab's saved cart. A pending submission must match its frozen lines exactly: damaged data
// must never become a new submission.
export function restoreOnlineCart(raw: string | null, restaurantId: string): OnlineCart {
  if (raw === null) return emptyOnlineCart(restaurantId);
  try {
    const value = JSON.parse(raw) as OnlineCart;
    if (value.version !== 1 || value.restaurantId !== restaurantId) throw new Error();
    const cart: OnlineCart = validateCart({
      version: 1,
      restaurantId,
      lines: restoreLines(value.lines),
      pending: null,
    });
    if (value.pending !== null) {
      const p = value.pending;
      if (!p || !isUuid(p.clientRequestId)) throw new Error();
      const expected = createOnlineIntent(
        cart,
        { name: p.customerName ?? "", phone: p.customerPhone ?? "" },
        p.clientRequestId,
      );
      if (
        JSON.stringify(expected) !==
        JSON.stringify({
          clientRequestId: p.clientRequestId,
          fulfillment: p.fulfillment,
          customerName: p.customerName,
          customerPhone: p.customerPhone,
          items: p.items?.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            expectedUnitPriceCents: l.expectedUnitPriceCents,
            remark: l.remark,
            optionIds: l.optionIds,
          })),
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

// Whether a failed submission frees the cart. Only an understood rejection of a first attempt does; a
// rejection after an unknown result never proves the original failed, so the intent stays.
export function submissionFailure(
  status: number | null,
  code: string | null,
  wasUnknown: boolean,
): FailureDisposition {
  if (wasUnknown || status === null || status >= 500) return "unknown";
  return [
    "VALIDATION_FAILED",
    "MENU_CHANGED",
    "ONLINE_PAUSED",
    "ONLINE_CLOSED",
    "ONLINE_BUSY",
    "ONLINE_NOT_OFFERED",
    "SERVICE_SUSPENDED",
    "DELIVERY_NOT_OFFERED",
    "ONLINE_LINK_NOT_FOUND",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
  ].includes(code ?? "")
    ? "editable"
    : "unknown";
}

// The status link of the customer's latest order at a restaurant, kept on the device so reopening the
// menu can point back to an order still in progress.
export const orderTokenKey = (restaurantId: string) => `tavoloflow:online-order:${restaurantId}`;

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
