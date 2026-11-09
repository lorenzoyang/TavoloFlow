import type { MenuItem, OptionGroup } from "../menu/api.ts";
import { isUuid } from "../../lib/ids.ts";
import { chosenOptions, selectionIssue, unitPriceCents, type ChosenOption } from "./options.ts";

// expectedUnitPriceCents includes the chosen options' deltas.
type OrderLineInput = {
  menuItemId: string;
  quantity: number;
  expectedUnitPriceCents: number;
  remark: string | null;
  optionIds: string[];
};
export type OrderInput = {
  sessionId: string;
  clientRequestId: string;
  items: OrderLineInput[];
};
export type CartLine = {
  item: MenuItem;
  // Snapshots of the chosen options in display order, refreshed with the dish.
  options: ChosenOption[];
  quantity: number;
  remark: string;
};
// Version 2: every line carries its chosen options. Any other saved version is treated as damaged.
export type Cart = {
  version: 2;
  restaurantId: string;
  tableId: string;
  sessionId: string | null;
  lines: CartLine[];
  pending: OrderInput | null;
};
type CartIssue = "limits" | "amount" | "unavailable" | "options" | "storage" | "damaged";
export class CartError extends Error {
  readonly issue: CartIssue;
  constructor(issue: CartIssue) {
    super(issue);
    this.issue = issue;
  }
}
export const cartKey = (restaurantId: string, tableId: string) =>
  `tavoloflow:cart:${restaurantId}:${tableId}`;
export const emptyCart = (
  restaurantId: string,
  tableId: string,
  sessionId: string | null,
): Cart => ({
  version: 2,
  restaurantId,
  tableId,
  sessionId,
  lines: [],
  pending: null,
});
const clean = (text: string) => text.trim();
export const linePrice = (line: Pick<CartLine, "item" | "options">) =>
  unitPriceCents(line.item, line.options);
export function totalCents(lines: CartLine[]): number {
  let total = 0n;
  for (const line of lines) {
    const price = linePrice(line);
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isSafeInteger(line.item.priceCents) ||
      line.item.priceCents < 1 ||
      !Number.isSafeInteger(price)
    )
      throw new CartError("amount");
    total += BigInt(price) * BigInt(line.quantity);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new CartError("amount");
  return Number(total);
}

export function validateCart(cart: Cart) {
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

const optionKey = (line: CartLine) => line.options.map((option) => option.id).join(",");

// The same dish with the same options and note is one line.
function merge(lines: CartLine[]) {
  const result: CartLine[] = [];
  for (const line of lines) {
    const same = result.find(
      (l) =>
        l.item.id === line.item.id &&
        optionKey(l) === optionKey(line) &&
        clean(l.remark) === clean(line.remark),
    );
    if (same) same.quantity += line.quantity;
    else result.push({ ...line });
  }
  return result;
}

// The caller passes the menu's groups, so a dish with options is added only with a complete choice.
export function addItem(
  cart: Cart,
  item: MenuItem,
  groups: readonly OptionGroup[] = [],
  optionIds: readonly string[] = [],
): Cart {
  if (cart.pending) return cart;
  if (!item.isAvailable || !item.allergenReviewed) throw new CartError("unavailable");
  if (selectionIssue(item, groups, optionIds)) throw new CartError("options");
  const options = chosenOptions(item, groups, optionIds);
  return validateCart({
    ...cart,
    lines: merge([...cart.lines, { item, options, quantity: 1, remark: "" }]),
  });
}
export function editLine(
  cart: Cart,
  index: number,
  patch: Partial<Pick<CartLine, "quantity" | "remark">>,
): Cart {
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
// Lines take the current dish and option details; a choice that no longer fits stops the review.
export function refreshCart(
  cart: Cart,
  menu: MenuItem[],
  groups: readonly OptionGroup[] = [],
): Cart {
  const lines = cart.lines.map((line) => {
    const item = menu.find((i) => i.id === line.item.id);
    if (!item || !item.isAvailable || !item.allergenReviewed) throw new CartError("unavailable");
    const ids = line.options.map((option) => option.id);
    if (selectionIssue(item, groups, ids)) throw new CartError("options");
    return { ...line, item, options: chosenOptions(item, groups, ids) };
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
      expectedUnitPriceCents: linePrice(l),
      remark: clean(l.remark) || null,
      optionIds: l.options.map((option) => option.id),
    })),
  };
}

function validItem(value: unknown): value is MenuItem {
  if (!value || typeof value !== "object") return false;
  const item = value as MenuItem;
  return (
    isUuid(item.id) &&
    typeof item.categoryId === "string" &&
    Array.isArray(item.optionGroupIds) &&
    item.optionGroupIds.every((x) => isUuid(x)) &&
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

function validOption(value: unknown): value is ChosenOption {
  if (!value || typeof value !== "object") return false;
  const option = value as ChosenOption;
  const names = [option.nameZh, option.nameIt, option.nameEn];
  return (
    isUuid(option.id) &&
    isUuid(option.groupId) &&
    names.every((x) => x === null || typeof x === "string") &&
    names.some((x) => typeof x === "string" && x.trim() !== "") &&
    Number.isSafeInteger(option.priceDeltaCents) &&
    option.priceDeltaCents >= 0
  );
}

export function restoreCart(raw: string | null, fallback: Cart): Cart {
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw) as Cart;
    if (
      value.version !== 2 ||
      value.restaurantId !== fallback.restaurantId ||
      value.tableId !== fallback.tableId ||
      (value.sessionId !== null && !isUuid(value.sessionId)) ||
      !Array.isArray(value.lines) ||
      value.lines.some(
        (l) =>
          !l ||
          !validItem(l.item) ||
          typeof l.remark !== "string" ||
          !Array.isArray(l.options) ||
          !l.options.every(validOption),
      )
    )
      throw new Error();
    const cart: Cart = validateCart({
      version: 2,
      restaurantId: value.restaurantId,
      tableId: value.tableId,
      sessionId: value.sessionId,
      lines: value.lines.map((l) => ({
        item: l.item,
        options: l.options.map((o) => ({
          id: o.id,
          groupId: o.groupId,
          nameZh: o.nameZh,
          nameIt: o.nameIt,
          nameEn: o.nameEn,
          priceDeltaCents: o.priceDeltaCents,
        })),
        quantity: l.quantity,
        remark: l.remark,
      })),
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

export function persistCart(
  storage: Pick<Storage, "setItem" | "getItem">,
  key: string,
  cart: Cart,
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
    "TABLE_DISABLED",
    "BILL_LIMIT_REACHED",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
  ].includes(code ?? "")
    ? "editable"
    : "unknown";
}
