import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkoutProblems,
  clearOrderToken,
  createOnlineIntent,
  emptyOnlineCart,
  onlineCartKey,
  orderEnded,
  orderTokenKey,
  orderView,
  readOrderToken,
  restoreOnlineCart,
  saveOrderToken,
  statusCopy,
  submissionFailure,
  type OnlineCart,
} from "../src/features/online-order/state.ts";
import { addItem, cartKey, CartError, editLine } from "../src/features/orders/state.ts";
import type { OnlineOrder } from "../src/features/online-order/api.ts";

const restaurant = "00000000-0000-4000-8000-000000000010";
const requestId = "00000000-0000-4000-8000-000000000011";
const item = {
  id: "00000000-0000-4000-8000-000000000001",
  categoryId: "category",
  nameZh: "拉面",
  nameIt: "Ramen",
  nameEn: "Ramen",
  descriptionZh: null,
  descriptionIt: null,
  descriptionEn: null,
  itemCode: "R1",
  priceCents: 1200,
  isAvailable: true,
  allergenReviewed: true,
  allergenCodes: ["GLUTEN"],
  imageId: null,
  optionGroupIds: [] as string[],
};
const form = { name: "  Marco Rossi ", phone: "+39 333 123 4567" };
const filled = (): OnlineCart =>
  editLine(addItem(addItem(emptyOnlineCart(restaurant), item), item), 0, {
    remark: " Poco brodo ",
  });
const throwsIssue = (fn: () => unknown, issue: string) =>
  assert.throws(fn, (e: unknown) => e instanceof CartError && e.issue === issue);

test("the online cart has its own key beside the QR carts", () => {
  assert.equal(onlineCartKey(restaurant), `tavoloflow:cart:${restaurant}:online`);
  assert.notEqual(onlineCartKey(restaurant), cartKey(restaurant, "table"));
});

test("checkout requires a trimmed name of 1-30 characters and the shared phone rule", () => {
  assert.deepEqual(checkoutProblems(form), []);
  assert.deepEqual(checkoutProblems({ name: "   ", phone: "12345" }), ["name", "phone"]);
  assert.deepEqual(checkoutProblems({ name: "M".repeat(31), phone: "3331234567" }), ["name"]);
  assert.deepEqual(checkoutProblems({ name: ` ${"M".repeat(30)} `, phone: "3331234567" }), []);
  assert.deepEqual(checkoutProblems({ name: "Marco", phone: "+39-333-1234567" }), ["phone"]);
  assert.deepEqual(checkoutProblems({ name: "Marco", phone: "+1234567890123456" }), ["phone"]);
});

test("the intent sends trimmed contact details and the confirmed lines", () => {
  const intent = createOnlineIntent(filled(), form, requestId);
  assert.deepEqual(intent, {
    clientRequestId: requestId,
    fulfillment: "PICKUP",
    customerName: "Marco Rossi",
    customerPhone: "+393331234567",
    items: [
      {
        menuItemId: item.id,
        quantity: 2,
        expectedUnitPriceCents: 1200,
        remark: "Poco brodo",
        optionIds: [],
      },
    ],
  });
  throwsIssue(() => createOnlineIntent(emptyOnlineCart(restaurant), form, requestId), "limits");
  throwsIssue(() => createOnlineIntent(filled(), form, "not-a-uuid"), "limits");
  throwsIssue(() => createOnlineIntent(filled(), { ...form, phone: "123" }, requestId), "limits");
  throwsIssue(
    () => createOnlineIntent({ ...filled(), pending: intent }, form, requestId),
    "limits",
  );
});

test("a saved cart restores only for its restaurant, with a pending intent matching its lines", () => {
  assert.deepEqual(restoreOnlineCart(null, restaurant), emptyOnlineCart(restaurant));
  const cart = filled();
  const pending = createOnlineIntent(cart, form, requestId);
  const saved = JSON.stringify({ ...cart, pending });
  assert.deepEqual(restoreOnlineCart(saved, restaurant), { ...cart, pending });
  assert.deepEqual(restoreOnlineCart(JSON.stringify(cart), restaurant), cart);

  throwsIssue(() => restoreOnlineCart(saved, "00000000-0000-4000-8000-000000000099"), "damaged");
  throwsIssue(
    () => restoreOnlineCart(JSON.stringify({ ...cart, version: 2 }), restaurant),
    "damaged",
  );
  throwsIssue(() => restoreOnlineCart("{", restaurant), "damaged");
  // A pending intent whose price or phone no longer matches its frozen lines is never resent.
  const tampered = { ...pending, items: [{ ...pending.items[0], expectedUnitPriceCents: 1 }] };
  throwsIssue(
    () => restoreOnlineCart(JSON.stringify({ ...cart, pending: tampered }), restaurant),
    "damaged",
  );
  throwsIssue(
    () =>
      restoreOnlineCart(
        JSON.stringify({ ...cart, pending: { ...pending, customerPhone: "+39 333" } }),
        restaurant,
      ),
    "damaged",
  );
});

test("only an understood rejection of a first attempt frees the cart", () => {
  for (const code of [
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
  ])
    assert.equal(submissionFailure(409, code, false), "editable", code);
  assert.equal(submissionFailure(409, "ONLINE_CLOSED", true), "unknown");
  assert.equal(submissionFailure(null, null, false), "unknown");
  assert.equal(submissionFailure(502, null, false), "unknown");
  assert.equal(submissionFailure(400, "SOMETHING_ELSE", false), "unknown");
});

test("the status link is remembered per restaurant and ignored when malformed", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd";
  assert.equal(readOrderToken(restaurant, storage), null);
  saveOrderToken(restaurant, token, storage);
  assert.equal(values.get(orderTokenKey(restaurant)), token);
  assert.equal(readOrderToken(restaurant, storage), token);
  assert.equal(readOrderToken("other", storage), null);
  values.set(orderTokenKey(restaurant), "../not a token");
  assert.equal(readOrderToken(restaurant, storage), null);
  clearOrderToken(restaurant, storage);
  assert.equal(values.size, 0);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readOrderToken(restaurant, broken), null);
  saveOrderToken(restaurant, token, broken);
  clearOrderToken(restaurant, broken);
});

type Status = Pick<
  OnlineOrder,
  "phase" | "sessionStatus" | "closeReason" | "items" | "fulfillment" | "rejectReason"
>;
const line = (status: OnlineOrder["items"][number]["status"]) => ({
  itemCode: null,
  nameZh: null,
  nameIt: "Ramen",
  nameEn: null,
  unitPriceCents: 1200,
  quantity: 1,
  remark: null,
  options: [],
  status,
});
const order = (patch: Partial<Status>): Status => ({
  phase: "ACCEPTED",
  sessionStatus: "ACTIVE",
  closeReason: null,
  items: [line("NEW")],
  fulfillment: "PICKUP",
  rejectReason: null,
  ...patch,
});

test("the status page follows the phase, then the session and its dishes", () => {
  const cases: [Partial<Status>, string, string, boolean][] = [
    [{ phase: "WAITING", sessionStatus: null, items: [line(null)] }, "waiting", "waiting", false],
    [{ phase: "EXPIRED", sessionStatus: null, items: [line(null)] }, "expired", "expired", true],
    [
      { phase: "REJECTED", sessionStatus: null, rejectReason: "SOLD_OUT" },
      "rejected",
      "rejectedSoldOut",
      true,
    ],
    [
      { phase: "REJECTED", sessionStatus: null, rejectReason: "BUSY" },
      "rejected",
      "rejectedBusy",
      true,
    ],
    [
      { phase: "REJECTED", sessionStatus: null, rejectReason: "CLOSING" },
      "rejected",
      "rejectedClosing",
      true,
    ],
    [
      {
        phase: "REJECTED",
        sessionStatus: null,
        rejectReason: "OUT_OF_RANGE",
        fulfillment: "DELIVERY",
      },
      "rejected",
      "rejectedOutOfRange",
      true,
    ],
    [{ phase: "REJECTED", sessionStatus: null }, "rejected", "rejectedNoReason", true],
    [{ items: [line("NEW"), line("READY")] }, "preparing", "preparingPickup", false],
    [{ fulfillment: "DELIVERY" }, "preparing", "preparingDelivery", false],
    [{ items: [line("READY"), line("CANCELLED")] }, "ready", "readyPickup", false],
    [{ items: [line("READY")], fulfillment: "DELIVERY" }, "ready", "readyDelivery", false],
    [{ items: [line("CANCELLED"), line("CANCELLED")] }, "allCancelled", "allCancelled", false],
    [{ sessionStatus: "CLOSED", closeReason: "PAID" }, "collected", "collectedPickup", true],
    [
      { sessionStatus: "CLOSED", closeReason: "PAID", fulfillment: "DELIVERY" },
      "collected",
      "collectedDelivery",
      true,
    ],
    [{ sessionStatus: "CLOSED", closeReason: "NO_SHOW" }, "closed", "closed", true],
    [
      { sessionStatus: "CLOSED", closeReason: "VOIDED", items: [line("CANCELLED")] },
      "closed",
      "closed",
      true,
    ],
  ];
  for (const [patch, view, copy, ended] of cases) {
    const value = order(patch);
    assert.equal(orderView(value), view, JSON.stringify(patch));
    assert.equal(statusCopy(value), copy, JSON.stringify(patch));
    assert.equal(orderEnded(value), ended, JSON.stringify(patch));
  }
});
