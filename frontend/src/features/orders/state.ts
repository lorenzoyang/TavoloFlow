import type { MenuItem } from "../menu/api.ts";
import { isUuid } from "../../lib/ids.ts";

type OrderLineInput = {
  menuItemId: string;
  quantity: number;
  expectedUnitPriceCents: number;
  remark: string | null;
};
export type OrderInput = {
  sessionId: string;
  clientRequestId: string;
  items: OrderLineInput[];
};
export type CartLine = { item: MenuItem; quantity: number; remark: string };
// What every channel's cart shares: its lines and the frozen submission, if any. Dine-in and pickup add
// their own entrance fields and intent shapes.
export type CartDraft = { lines: CartLine[]; pending: unknown };
export type Cart = {
  version: 1;
  restaurantId: string;
  tableId: string;
  sessionId: string | null;
  lines: CartLine[];
  pending: OrderInput | null;
};
type CartIssue = "limits" | "amount" | "unavailable" | "storage" | "damaged";
export class CartError extends Error {
  readonly issue: CartIssue;
  constructor(issue: CartIssue) {
    super(issue);
    this.issue = issue;
  }
}
// Carts are kept per entrance: a table's QR menu, or the restaurant's online pickup menu. Table ids are
// UUIDs, so the pickup key can never collide with a table's, and existing dine-in keys stay unchanged.
export const cartKey = (restaurantId: string, tableId: string) =>
  `tavoloflow:cart:${restaurantId}:${tableId}`;
export const pickupCartKey = (restaurantId: string) => `tavoloflow:cart:${restaurantId}:pickup`;
export const emptyCart = (
  restaurantId: string,
  tableId: string,
  sessionId: string | null,
): Cart => ({
  version: 1,
  restaurantId,
  tableId,
  sessionId,
  lines: [],
  pending: null,
});
const clean = (text: string) => text.trim();
export function totalCents(lines: CartLine[]): number {
  let total = 0n;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isSafeInteger(line.item.priceCents) ||
      line.item.priceCents < 1
    )
      throw new CartError("amount");
    total += BigInt(line.item.priceCents) * BigInt(line.quantity);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new CartError("amount");
  return Number(total);
}

export function validateCart<T extends Pick<CartDraft, "lines">>(cart: T): T {
  if (
    cart.lines.length > 30 ||
    cart.lines.some(
      (l) =>
        !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 20 || l.remark.length > 200,
    ) ||
    cart.lines.reduce((n, l) => n + l.quantity, 0) > 100
  )
    throw new CartError("limits");
  totalCents(cart.lines);
  return cart;
}

function merge(lines: CartLine[]) {
  const result: CartLine[] = [];
  for (const line of lines) {
    const same = result.find(
      (l) => l.item.id === line.item.id && clean(l.remark) === clean(line.remark),
    );
    if (same) same.quantity += line.quantity;
    else result.push({ ...line });
  }
  return result;
}

export function addItem<T extends CartDraft>(cart: T, item: MenuItem): T {
  if (cart.pending) return cart;
  if (!item.isAvailable || !item.allergenReviewed) throw new CartError("unavailable");
  return validateCart({
    ...cart,
    lines: merge([...cart.lines, { item, quantity: 1, remark: "" }]),
  });
}
export function editLine<T extends CartDraft>(
  cart: T,
  index: number,
  patch: Partial<Pick<CartLine, "quantity" | "remark">>,
): T {
  if (cart.pending) return cart;
  return validateCart({
    ...cart,
    lines: merge(
      cart.lines.flatMap((line, i) =>
        i !== index ? [line] : patch.quantity === 0 ? [] : [{ ...line, ...patch }],
      ),
    ),
  });
}
export function refreshCart<T extends CartDraft>(cart: T, menu: MenuItem[]): T {
  const lines = cart.lines.map((line) => {
    const item = menu.find((i) => i.id === line.item.id);
    if (!item || !item.isAvailable || !item.allergenReviewed) throw new CartError("unavailable");
    return { ...line, item };
  });
  return validateCart({ ...cart, lines });
}
export function createIntent(cart: Cart, sessionId: string, requestId: string): OrderInput {
  validateCart(cart);
  if (!cart.lines.length || cart.pending || !isUuid(sessionId) || !isUuid(requestId))
    throw new CartError("limits");
  return {
    sessionId,
    clientRequestId: requestId,
    items: cart.lines.map((l) => ({
      menuItemId: l.item.id,
      quantity: l.quantity,
      expectedUnitPriceCents: l.item.priceCents,
      remark: clean(l.remark) || null,
    })),
  };
}

export function validItem(value: unknown): value is MenuItem {
  if (!value || typeof value !== "object") return false;
  const item = value as MenuItem;
  return (
    isUuid(item.id) &&
    typeof item.categoryId === "string" &&
    Number.isSafeInteger(item.priceCents) &&
    item.priceCents > 0 &&
    typeof item.isAvailable === "boolean" &&
    typeof item.allergenReviewed === "boolean" &&
    Array.isArray(item.allergenCodes) &&
    item.allergenCodes.every((x) => typeof x === "string") &&
    [item.nameZh, item.nameIt, item.nameEn].some((x) => typeof x === "string" && x.trim()) &&
    [
      item.nameZh,
      item.nameIt,
      item.nameEn,
      item.itemCode,
      item.descriptionZh,
      item.descriptionIt,
      item.descriptionEn,
    ].every((x) => x === null || typeof x === "string")
  );
}

export function restoreCart(raw: string | null, fallback: Cart): Cart {
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw) as Cart;
    if (
      value.version !== 1 ||
      value.restaurantId !== fallback.restaurantId ||
      value.tableId !== fallback.tableId ||
      (value.sessionId !== null && !isUuid(value.sessionId)) ||
      !Array.isArray(value.lines) ||
      value.lines.some((l) => !l || !validItem(l.item) || typeof l.remark !== "string")
    )
      throw new Error();
    const cart: Cart = validateCart({
      version: 1,
      restaurantId: value.restaurantId,
      tableId: value.tableId,
      sessionId: value.sessionId,
      lines: value.lines.map((l) => ({ item: l.item, quantity: l.quantity, remark: l.remark })),
      pending: null,
    });
    if (value.pending !== null) {
      const p = value.pending;
      if (!p || p.sessionId !== cart.sessionId || !isUuid(p.clientRequestId)) throw new Error();
      const expected = createIntent(cart, p.sessionId, p.clientRequestId);
      // A pending request must match its frozen draft exactly; damaged data must never become a new submission.
      if (
        JSON.stringify(expected) !==
        JSON.stringify({
          sessionId: p.sessionId,
          clientRequestId: p.clientRequestId,
          items: p.items?.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            expectedUnitPriceCents: l.expectedUnitPriceCents,
            remark: l.remark,
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

export function persistCart(
  storage: Pick<Storage, "setItem" | "getItem">,
  key: string,
  cart: CartDraft,
) {
  const raw = JSON.stringify(cart);
  try {
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error();
  } catch {
    throw new CartError("storage");
  }
}

type FailureDisposition = "ended" | "reauthenticate" | "editable" | "unknown";
export function submissionFailure(
  status: number | null,
  code: string | null,
  wasUnknown: boolean,
): FailureDisposition {
  if (
    [
      "SESSION_CLOSED",
      "SESSION_NOT_FOUND",
      "QR_NOT_FOUND",
      "TABLE_NOT_FOUND",
      "RESTAURANT_NOT_FOUND",
    ].includes(code ?? "")
  )
    return "ended";
  if (status === 401 || code === "GUEST_SESSION_MISMATCH" || code === "GUEST_ACCESS_DENIED")
    return "reauthenticate";
  if (wasUnknown || status === null || status >= 500 || code === "ORDER_NOT_FOUND")
    return "unknown";
  // Only an understood business rejection can release a first attempt. A proxy's malformed 4xx is not proof of failure.
  return [
    "VALIDATION_FAILED",
    "MENU_CHANGED",
    "ORDERING_PAUSED",
    "SERVICE_SUSPENDED",
    "DINE_IN_NOT_OFFERED",
    "TABLE_DISABLED",
    "BILL_LIMIT_REACHED",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
  ].includes(code ?? "")
    ? "editable"
    : "unknown";
}
