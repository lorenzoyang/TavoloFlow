import { isUuid } from "../../lib/ids.ts";
import { normalizePhone } from "../../lib/pickup-rules.ts";
import {
  CartError,
  pickupCartKey,
  refreshCart,
  validateCart,
  validItem,
  type CartLine,
} from "../orders/state.ts";
import type { MenuItem } from "../menu/api.ts";

// What the guest submits: the persisted, frozen request that a manual retry resends unchanged.
export type PickupIntent = {
  clientRequestId: string;
  customerName: string;
  customerPhone: string;
  items: {
    menuItemId: string;
    quantity: number;
    expectedUnitPriceCents: number;
    remark: string | null;
  }[];
};
// One cart per tab and restaurant (pickupCartKey); no table and no session.
export type PickupCart = {
  version: 1;
  restaurantId: string;
  lines: CartLine[];
  pending: PickupIntent | null;
};
export type ContactProblem = "name" | "phone";
export type PickupOrderStatus =
  "PENDING" | "EXPIRED" | "REJECTED" | "ACCEPTED" | "READY" | "CANCELLED" | "PICKED_UP" | "CLOSED";
export type RejectReason = "SOLD_OUT" | "BUSY" | "CLOSING";

export const emptyPickupCart = (restaurantId: string): PickupCart => ({
  version: 1,
  restaurantId,
  lines: [],
  pending: null,
});

// Refresh prices for display first. A changed price requires another deliberate tap before any intent
// is frozen or POST sent, including when a background menu refresh has already arrived.
export function reviewPickupCart(cart: PickupCart, menu: MenuItem[]) {
  const refreshed = refreshCart(cart, menu);
  return {
    cart: refreshed,
    priceChanged: refreshed.lines.some(
      (line, index) => line.item.priceCents !== cart.lines[index].item.priceCents,
    ),
  };
}

// The server's contact rules: a one-line name of 1–20 characters and the shared phone rule.
export function contactProblem(name: string, phone: string): ContactProblem | null {
  const trimmed = name.trim();
  // oxlint-disable-next-line no-control-regex
  if (!trimmed || trimmed.length > 20 || /[\u0000-\u001f\u007f-\u009f]/.test(trimmed))
    return "name";
  return normalizePhone(phone) ? null : "phone";
}

export function createPickupIntent(
  cart: PickupCart,
  name: string,
  phone: string,
  requestId: string,
): PickupIntent {
  validateCart(cart);
  if (!cart.lines.length || cart.pending || !isUuid(requestId)) throw new CartError("limits");
  if (contactProblem(name, phone)) throw new CartError("limits");
  return {
    clientRequestId: requestId,
    customerName: name.trim(),
    customerPhone: normalizePhone(phone)!,
    items: cart.lines.map((l) => ({
      menuItemId: l.item.id,
      quantity: l.quantity,
      expectedUnitPriceCents: l.item.priceCents,
      remark: l.remark.trim() || null,
    })),
  };
}

// A stored cart must match its restaurant, and a pending request its frozen lines exactly: damaged data
// must never turn into a new submission.
export function restorePickupCart(raw: string | null, fallback: PickupCart): PickupCart {
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw) as PickupCart;
    if (
      value.version !== 1 ||
      value.restaurantId !== fallback.restaurantId ||
      !Array.isArray(value.lines) ||
      value.lines.some((l) => !l || !validItem(l.item) || typeof l.remark !== "string")
    )
      throw new Error();
    const cart: PickupCart = validateCart({
      ...fallback,
      lines: value.lines.map((l) => ({ item: l.item, quantity: l.quantity, remark: l.remark })),
    });
    if (value.pending !== null) {
      const p = value.pending;
      if (!p || typeof p.customerName !== "string" || typeof p.customerPhone !== "string")
        throw new Error();
      const expected = createPickupIntent(cart, p.customerName, p.customerPhone, p.clientRequestId);
      if (JSON.stringify(expected) !== JSON.stringify(p)) throw new Error();
      cart.pending = expected;
    }
    return cart;
  } catch {
    throw new CartError("damaged");
  }
}

// Reading storage itself may throw. Never remove or overwrite damaged bytes: they may be the only
// recovery record for a submission the restaurant has already received.
export function loadPickupCart(restaurantId: string, storage: () => Pick<Storage, "getItem">) {
  const blank = emptyPickupCart(restaurantId);
  try {
    return {
      cart: restorePickupCart(storage().getItem(pickupCartKey(restaurantId)), blank),
      problem: null,
    };
  } catch (error) {
    return {
      cart: blank,
      problem: error instanceof CartError ? error.issue : ("storage" as const),
    };
  }
}

export function confirmedPickupSubmission(value: unknown) {
  const result = value as { statusToken: string; pickupNumber: number; expiresAt: string } | null;
  if (
    !result ||
    !isStatusToken(result.statusToken) ||
    !Number.isSafeInteger(result.pickupNumber) ||
    result.pickupNumber < 1 ||
    typeof result.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(result.expiresAt))
  )
    throw new Error("Invalid pickup submission response");
  return result;
}

// Only an understood rejection of a first attempt releases the frozen request; anything else may have
// been saved, so the guest recovers by GET or retries the same request.
export function pickupFailure(
  status: number | null,
  code: string | null,
  wasUnknown: boolean,
): "editable" | "unknown" {
  if (wasUnknown || status === null || status >= 500) return "unknown";
  return [
    "VALIDATION_FAILED",
    "MENU_CHANGED",
    "MENU_LINK_NOT_FOUND",
    "PICKUP_NOT_OFFERED",
    "PICKUP_PAUSED",
    "PICKUP_CLOSED",
    "PICKUP_BUSY",
    "SERVICE_SUSPENDED",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
  ].includes(code ?? "")
    ? "editable"
    : "unknown";
}

// How the status page reads a status. The restaurant's phone always shows; it leads when the guest
// has to call. A finished request stops polling and no longer counts as an ongoing order.
export function statusView(status: PickupOrderStatus, reason: RejectReason | null) {
  return {
    headline:
      status === "REJECTED"
        ? reason
          ? (`rejected_${reason}` as const)
          : ("rejected" as const)
        : status,
    callFirst: status === "EXPIRED" || status === "REJECTED" || status === "CANCELLED",
    finished:
      status === "EXPIRED" ||
      status === "REJECTED" ||
      status === "PICKED_UP" ||
      status === "CLOSED",
  };
}

// The latest request's status token, per restaurant, so reopening the menu can show the ongoing order.
// A deliberate exception to keeping no tokens: it reads only this request, like a link the guest saved.
export const orderTokenKey = (restaurantId: string) => `tavoloflow:pickup-order:${restaurantId}`;
export const isStatusToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export function readOrderToken(
  restaurantId: string,
  storage: Pick<Storage, "getItem"> | (() => Pick<Storage, "getItem">),
) {
  try {
    const value = (typeof storage === "function" ? storage() : storage).getItem(
      orderTokenKey(restaurantId),
    );
    return isStatusToken(value) ? value : null;
  } catch {
    return null;
  }
}
export function saveOrderToken(
  restaurantId: string,
  token: string,
  storage: Pick<Storage, "setItem"> | (() => Pick<Storage, "setItem">),
) {
  try {
    (typeof storage === "function" ? storage() : storage).setItem(
      orderTokenKey(restaurantId),
      token,
    );
  } catch {
    /* The status page link still works without storage. */
  }
}
