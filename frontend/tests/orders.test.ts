import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, cartKey, CartError, createIntent, editLine, emptyCart, persistCart, refreshCart,
  restoreCart, submissionFailure, totalCents, validateCart } from "../src/features/orders/state.ts";
import { parsePendingAction } from "../src/features/dining/state.ts";
import { confirmedOrder } from "../src/features/orders/response.ts";
import type { Order } from "../src/features/orders/api.ts";

const item = { id: "00000000-0000-4000-8000-000000000001", categoryId: "category", nameZh: "炒饭", nameIt: "Riso", nameEn: "Rice",
  descriptionZh: null, descriptionIt: null, descriptionEn: null, itemCode: "A1", priceCents: 700,
  isAvailable: true, allergenReviewed: true, allergenCodes: ["SOY"] };
const session = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const blank = () => emptyCart("restaurant", "table", session);
const throwsIssue = (fn: () => unknown, issue: string) => assert.throws(fn, (e: unknown) => e instanceof CartError && e.issue === issue);

test("cart merges the same dish and normalized note, keeping different preparation notes separate", () => {
  let cart = addItem(addItem(blank(), item), item);
  assert.equal(cart.lines.length, 1); assert.equal(cart.lines[0].quantity, 2);
  cart = editLine(cart, 0, { remark: " 少盐 " });
  cart = addItem(cart, item);
  assert.equal(cart.lines.length, 2);
  cart = editLine(cart, 1, { remark: "少盐" });
  assert.equal(cart.lines.length, 1); assert.equal(cart.lines[0].quantity, 3);
  assert.equal(totalCents(cart.lines), 2100);
  assert.equal(editLine(cart, 0, { quantity: 0 }).lines.length, 0);
});

test("line, total quantity, note and line count limits reject instead of silently changing the draft", () => {
  const cart = addItem(blank(), item);
  throwsIssue(() => editLine(cart, 0, { quantity: 21 }), "limits");
  throwsIssue(() => editLine(cart, 0, { quantity: 1.5 }), "limits");
  throwsIssue(() => editLine(cart, 0, { remark: "x".repeat(201) }), "limits");
  throwsIssue(() => validateCart({ ...cart, orderNote: "x".repeat(501) }), "limits");
  throwsIssue(() => validateCart({ ...cart, lines: Array.from({ length: 31 }, () => cart.lines[0]) }), "limits");
  throwsIssue(() => validateCart({ ...cart, lines: Array.from({ length: 6 }, () => ({ ...cart.lines[0], quantity: 20 })) }), "limits");
  assert.equal(cart.lines[0].quantity, 1);
});

test("integer cents remain exact at the safe boundary and reject arithmetic overflow", () => {
  const cart = addItem(blank(), { ...item, priceCents: Number.MAX_SAFE_INTEGER });
  assert.equal(totalCents(cart.lines), Number.MAX_SAFE_INTEGER);
  throwsIssue(() => editLine(cart, 0, { quantity: 2 }), "amount");
  throwsIssue(() => addItem(cart, { ...item, id: "00000000-0000-4000-8000-000000000005" }), "amount");
});

test("unavailable or unreviewed dishes cannot be added; a changed price requires a refreshed review", () => {
  throwsIssue(() => addItem(blank(), { ...item, isAvailable: false }), "unavailable");
  throwsIssue(() => addItem(blank(), { ...item, allergenReviewed: false }), "unavailable");
  const cart = addItem(blank(), item);
  throwsIssue(() => refreshCart(cart, []), "unavailable");
  throwsIssue(() => refreshCart(cart, [{ ...item, isAvailable: false }]), "unavailable");
  assert.equal(refreshCart(cart, [{ ...item, priceCents: 900 }]).lines[0].item.priceCents, 900);
  assert.equal(cart.lines[0].item.priceCents, 700);
});

test("pending intent survives reload with identical request id, content and session and blocks edits", () => {
  const cart = { ...addItem(blank(), item), orderNote: " 一起上菜 " };
  const pending = createIntent(cart, session, id);
  const frozen = { ...cart, pending };
  const restored = restoreCart(JSON.stringify(frozen), blank());
  assert.deepEqual(restored.pending, pending);
  assert.equal(restored.pending?.orderNote, "一起上菜");
  assert.equal(addItem(restored, item), restored);
  assert.equal(editLine(restored, 0, { quantity: 0 }), restored);
});

test("unopened draft remains unbound until explicit confirmation and is isolated by table and restaurant", () => {
  const cart = addItem(emptyCart("r", "t", null), item);
  const restored = restoreCart(JSON.stringify(cart), emptyCart("r", "t", session));
  assert.equal(restored.sessionId, null);
  const input = createIntent(restored, session, id);
  assert.equal(input.sessionId, session);
  assert.equal(restored.sessionId, null);
  assert.notEqual(cartKey("r", "t"), cartKey("r", "other"));
  assert.notEqual(cartKey("r", "t"), cartKey("other", "t"));
  throwsIssue(() => restoreCart(JSON.stringify(cart), emptyCart("r", "other", session)), "damaged");
});

test("corrupt pending content is never silently treated as an empty/new order", () => {
  const cart = addItem(blank(), item);
  const pending = createIntent(cart, session, id);
  for (const raw of ["{", "null", JSON.stringify({ ...cart, pending: {} }),
    JSON.stringify({ ...cart, pending: { ...pending, items: [] } }),
    JSON.stringify({ ...cart, pending: { ...pending, sessionId: id } }),
    JSON.stringify({ ...cart, pending: { ...pending, items: [{ ...pending.items[0], quantity: 2 }] } })])
    throwsIssue(() => restoreCart(raw, blank()), "damaged");
});

test("durable storage must succeed and read back exactly before an intent may be sent", () => {
  const cart = addItem(blank(), item); cart.pending = createIntent(cart, session, id);
  let value: string | null = null;
  const storage = { setItem: (_key: string, raw: string) => { value = raw; }, getItem: () => value };
  persistCart(storage, "key", cart);
  assert.deepEqual(restoreCart(value, blank()).pending, cart.pending);
  throwsIssue(() => persistCart({ setItem: () => { throw new Error(); }, getItem: () => null }, "key", cart), "storage");
  throwsIssue(() => persistCart({ setItem: () => {}, getItem: () => null }, "key", cart), "storage");
});

test("unknown results never release the original intent merely because a lookup or manual retry fails", () => {
  assert.equal(submissionFailure(null, null, false), "unknown");
  assert.equal(submissionFailure(500, "INTERNAL_ERROR", false), "unknown");
  assert.equal(submissionFailure(400, "UNKNOWN_ERROR", false), "unknown");
  assert.equal(submissionFailure(404, "ORDER_NOT_FOUND", true), "unknown");
  assert.equal(submissionFailure(409, "MENU_CHANGED", true), "unknown");
  assert.equal(submissionFailure(400, "CSRF_VALIDATION_FAILED", true), "unknown");
  assert.equal(submissionFailure(409, "MENU_CHANGED", false), "editable");
  assert.equal(submissionFailure(401, "GUEST_AUTH_REQUIRED", false), "reauthenticate");
  assert.equal(submissionFailure(403, "GUEST_SESSION_MISMATCH", true), "reauthenticate");
  assert.equal(submissionFailure(409, "SESSION_CLOSED", true), "ended");
});

test("only a complete server order with consistent safe amounts may clear the saved intent", () => {
  const order: Order = { id, sessionId: session, status: "NEW", createdAt: "2026-10-22T12:00:00Z", defaultLanguage: "en",
    totalAmountCents: 1400, orderNote: null, items: [{ id, menuItemId: item.id, itemCode: "A1", nameZh: "炒饭", nameIt: null,
      nameEn: "Rice", allergenCodes: ["SOY"], unitPriceCents: 700, quantity: 2, remark: null }] };
  assert.equal(confirmedOrder(order, session), order);
  for (const broken of [{ ...order, sessionId: id }, { ...order, createdAt: "bad date" }, { ...order, items: [{}] },
    { ...order, totalAmountCents: 1300 }, { ...order, defaultLanguage: "fr" }, { ...order, orderNote: undefined }])
    assert.throws(() => confirmedOrder(broken as Order, session));
});

test("the accepting-orders switch restores as a GET-only recovery action", () => {
  assert.deepEqual(parsePendingAction('{"kind":"accepting","enabled":false}'), { kind: "accepting", enabled: false });
  assert.equal(parsePendingAction('{"kind":"accepting","enabled":"false"}'), null);
});
