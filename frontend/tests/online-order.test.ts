import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkoutProblems,
  clearOrderToken,
  couponDiscountCents,
  createOnlineIntent,
  currentQuote,
  deliveryNote,
  deliveryShortfallCents,
  emptyOnlineCart,
  existingSubmission,
  feeStatus,
  normalizeAddress,
  onlineCartAmounts,
  onlineCartKey,
  orderEnded,
  orderProgress,
  orderTokenKey,
  orderView,
  readOrderToken,
  restoreOnlineCart,
  saveOrderToken,
  statusCopy,
  submissionFailure,
  type AddressQuote,
  type OnlineCart,
  type OrderView,
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
  salePriceCents: null as number | null,
  isAvailable: true,
  allergenReviewed: true,
  allergenCodes: ["GLUTEN"],
  imageId: null,
  optionGroupIds: [] as string[],
};
const form = {
  fulfillment: "PICKUP" as const,
  name: "  Marco Rossi ",
  phone: "+39 333 123 4567",
  address: "",
  notes: "",
  coupon: null as { code: string; percentOff: number } | null,
  quote: null as AddressQuote | null,
};
const delivery = {
  ...form,
  fulfillment: "DELIVERY" as const,
  address: "  Via Roma 1, Milano ",
  notes: " Citofono 3 ",
};
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
  const contact = (name: string, phone: string) => ({ ...form, name, phone });
  assert.deepEqual(checkoutProblems(contact("   ", "12345")), ["name", "phone"]);
  assert.deepEqual(checkoutProblems(contact("M".repeat(31), "3331234567")), ["name"]);
  assert.deepEqual(checkoutProblems(contact(` ${"M".repeat(30)} `, "3331234567")), []);
  assert.deepEqual(checkoutProblems(contact("Marco", "+39-333-1234567")), ["phone"]);
  assert.deepEqual(checkoutProblems(contact("Marco", "+1234567890123456")), ["phone"]);
  // Pickup ignores whatever the delivery fields hold.
  assert.deepEqual(checkoutProblems({ ...form, address: "", notes: "x".repeat(200) }), []);
});

test("delivery also needs an address of 1-200 characters and takes notes of up to 100", () => {
  assert.deepEqual(checkoutProblems(delivery), []);
  assert.deepEqual(checkoutProblems({ ...delivery, address: "   ", notes: "" }), ["address"]);
  assert.deepEqual(checkoutProblems({ ...delivery, address: ` ${"a".repeat(200)} ` }), []);
  assert.deepEqual(checkoutProblems({ ...delivery, address: "a".repeat(201) }), ["address"]);
  assert.deepEqual(checkoutProblems({ ...delivery, notes: ` ${"n".repeat(100)} ` }), []);
  assert.deepEqual(checkoutProblems({ ...delivery, notes: "n".repeat(101) }), ["notes"]);
  assert.deepEqual(checkoutProblems({ ...delivery, name: "", address: "" }), ["name", "address"]);
});

test("the intent sends trimmed contact details and the confirmed lines", () => {
  const intent = createOnlineIntent(filled(), form, requestId);
  assert.deepEqual(intent, {
    clientRequestId: requestId,
    fulfillment: "PICKUP",
    customerName: "Marco Rossi",
    customerPhone: "+393331234567",
    deliveryAddress: null,
    deliveryNotes: null,
    items: [
      {
        menuItemId: item.id,
        quantity: 2,
        expectedUnitPriceCents: 1200,
        remark: "Poco brodo",
        optionIds: [],
      },
    ],
    coupon: null,
    deliveryQuote: null,
  });
  throwsIssue(() => createOnlineIntent(emptyOnlineCart(restaurant), form, requestId), "limits");
  throwsIssue(() => createOnlineIntent(filled(), form, "not-a-uuid"), "limits");
  throwsIssue(() => createOnlineIntent(filled(), { ...form, phone: "123" }, requestId), "limits");
  throwsIssue(
    () => createOnlineIntent({ ...filled(), pending: intent }, form, requestId),
    "limits",
  );
  // Pickup never sends an address, even if the form still holds one from switching back.
  assert.equal(
    createOnlineIntent(filled(), { ...form, address: "Via Roma 1" }, requestId).deliveryAddress,
    null,
  );
});

test("a delivery intent sends the trimmed address and notes, and blank notes as null", () => {
  const intent = createOnlineIntent(filled(), delivery, requestId);
  assert.equal(intent.fulfillment, "DELIVERY");
  assert.equal(intent.deliveryAddress, "Via Roma 1, Milano");
  assert.equal(intent.deliveryNotes, "Citofono 3");
  assert.equal(
    createOnlineIntent(filled(), { ...delivery, notes: "   " }, requestId).deliveryNotes,
    null,
  );
  throwsIssue(
    () => createOnlineIntent(filled(), { ...delivery, address: "" }, requestId),
    "limits",
  );
  throwsIssue(
    () =>
      createOnlineIntent(
        filled(),
        { ...form, fulfillment: "COURIER" as unknown as "PICKUP" },
        requestId,
      ),
    "limits",
  );

  // A saved delivery intent restores only with its exact address and notes.
  const cart = filled();
  const saved = { ...cart, pending: intent };
  assert.deepEqual(restoreOnlineCart(JSON.stringify(saved), restaurant), saved);
  for (const pending of [
    { ...intent, deliveryAddress: "Via Milano 2 " },
    { ...intent, deliveryAddress: null },
    { ...intent, fulfillment: "PICKUP" },
    { ...intent, deliveryNotes: undefined },
  ])
    throwsIssue(
      () => restoreOnlineCart(JSON.stringify({ ...cart, pending }), restaurant),
      "damaged",
    );
  // A pickup intent carrying an address was not written by this page.
  const pickup = createOnlineIntent(cart, form, requestId);
  throwsIssue(
    () =>
      restoreOnlineCart(
        JSON.stringify({ ...cart, pending: { ...pickup, deliveryAddress: "Via Roma 1" } }),
        restaurant,
      ),
    "damaged",
  );
});

test("the delivery note follows the customer's language, then the restaurant's fallback", () => {
  const notes = {
    defaultLanguage: "zh" as const,
    deliveryNoteZh: "5 公里内免费",
    deliveryNoteIt: " Entro 5 km gratis ",
    deliveryNoteEn: null,
  };
  assert.deepEqual(deliveryNote(notes, "it"), { text: "Entro 5 km gratis", language: "it" });
  assert.deepEqual(deliveryNote(notes, "en"), { text: "5 公里内免费", language: "zh" });
  assert.deepEqual(deliveryNote({ ...notes, deliveryNoteZh: "  " }, "en"), {
    text: "Entro 5 km gratis",
    language: "it",
  });
  assert.equal(deliveryNote({ ...notes, deliveryNoteZh: null, deliveryNoteIt: null }, "zh"), null);
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

test("an understood rejection frees the cart; after an unknown result only one that proves nothing was stored", () => {
  for (const code of [
    "VALIDATION_FAILED",
    "MENU_CHANGED",
    "ONLINE_PAUSED",
    "ONLINE_CLOSED",
    "ONLINE_BUSY",
    "ONLINE_NOT_OFFERED",
    "SERVICE_SUSPENDED",
    "DELIVERY_NOT_OFFERED",
    "COUPON_INVALID",
    "DELIVERY_MIN_ORDER",
    "DELIVERY_QUOTE_INVALID",
    "ONLINE_LINK_NOT_FOUND",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
  ])
    assert.equal(submissionFailure(409, code, false), "editable", code);
  // A retry after an unknown result frees the cart only when the rejection proves no request was stored.
  for (const code of [
    "MENU_CHANGED",
    "ONLINE_CLOSED",
    "ONLINE_BUSY",
    "SERVICE_SUSPENDED",
    "COUPON_INVALID",
    "DELIVERY_MIN_ORDER",
    "DELIVERY_QUOTE_INVALID",
  ])
    assert.equal(submissionFailure(409, code, true), "editable", code);
  for (const code of [
    "VALIDATION_FAILED",
    "ONLINE_LINK_NOT_FOUND",
    "CSRF_VALIDATION_FAILED",
    "RATE_LIMITED",
    "SOMETHING_ELSE",
  ])
    assert.equal(submissionFailure(409, code, true), "unknown", code);
  assert.equal(submissionFailure(null, null, true), "unknown");
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

test("only an order going ahead shows its progress", () => {
  const expected: Record<OrderView, number | null> = {
    waiting: 0,
    preparing: 1,
    ready: 2,
    collected: 3,
    expired: null,
    rejected: null,
    allCancelled: null,
    closed: null,
  };
  for (const [view, step] of Object.entries(expected))
    assert.equal(orderProgress(view as OrderView), step, view);
});

test("a confirmed coupon travels in the intent and restores only exactly as saved", () => {
  const coupon = { code: "ESTATE10", percentOff: 10 };
  const cart = filled();
  const intent = createOnlineIntent(cart, { ...form, coupon }, requestId);
  assert.deepEqual(intent.coupon, coupon);
  const saved = { ...cart, pending: intent };
  assert.deepEqual(restoreOnlineCart(JSON.stringify(saved), restaurant), saved);
  // Damaged coupons never restore: one this page would not have confirmed, or a missing field.
  for (const changed of [
    { ...intent, coupon: { code: "estate10", percentOff: 10 } },
    { ...intent, coupon: undefined },
    { ...intent, coupon: { code: "ESTATE10" } },
  ])
    throwsIssue(
      () => restoreOnlineCart(JSON.stringify({ ...cart, pending: changed }), restaurant),
      "damaged",
    );
  // Only a code the restaurant confirmed (normalized, 1-50 %) can be sent.
  for (const bad of [
    { code: "estate10", percentOff: 10 },
    { code: "ESTATE10", percentOff: 0 },
    { code: "ESTATE10", percentOff: 51 },
    { code: "ES", percentOff: 10 },
  ])
    throwsIssue(() => createOnlineIntent(cart, { ...form, coupon: bad }, requestId), "limits");
});

test("the coupon discount rounds down to the cent like the server", () => {
  assert.equal(couponDiscountCents(2400, 10), 240);
  assert.equal(couponDiscountCents(1999, 15), 299);
  assert.equal(couponDiscountCents(1, 50), 0);
  assert.equal(
    couponDiscountCents(Number.MAX_SAFE_INTEGER, 50),
    Math.floor(Number.MAX_SAFE_INTEGER / 2),
  );
});

test("the panel and bar apply a coupon only during checkout, using the reviewed sale price", () => {
  const cart = addItem(emptyOnlineCart(restaurant), item);
  const review = addItem(emptyOnlineCart(restaurant), { ...item, salePriceCents: 990 });
  const coupon = { code: "ESTATE15", percentOff: 15 };
  const checkout = { ...form, coupon };

  // A coupon retained in the form does not discount the ordinary cart or a cart returned for editing.
  assert.deepEqual(onlineCartAmounts(cart, null, checkout), {
    itemsCents: 1200,
    coupon: null,
    discountCents: 0,
    totalCents: 1200,
    deliveryFeeCents: null,
    payableCents: 1200,
  });
  assert.deepEqual(onlineCartAmounts(cart, review, checkout), {
    itemsCents: 990,
    coupon,
    discountCents: 148,
    totalCents: 842,
    deliveryFeeCents: null,
    payableCents: 842,
  });
  assert.deepEqual(onlineCartAmounts(cart, review, form), {
    itemsCents: 990,
    coupon: null,
    discountCents: 0,
    totalCents: 990,
    deliveryFeeCents: null,
    payableCents: 990,
  });
});

test("the delivery minimum compares the total shown, which takes the coupon off during checkout", () => {
  const cart = addItem(addItem(emptyOnlineCart(restaurant), item), item);
  const checkout = { ...delivery, coupon: { code: "ESTATE10", percentOff: 10 } };
  const shown = (review: OnlineCart | null) => onlineCartAmounts(cart, review, checkout).totalCents;
  assert.equal(deliveryShortfallCents(shown(null), null), 0);
  // 24 € of dishes reach 24 € while editing; with 10% off at checkout they fall 2.40 € short.
  assert.equal(deliveryShortfallCents(shown(null), 2400), 0);
  assert.equal(deliveryShortfallCents(shown(cart), 2400), 240);
  assert.equal(deliveryShortfallCents(shown(cart), 2160), 0);
  assert.equal(deliveryShortfallCents(shown(cart), 2161), 1);
});

test("an unknown submission keeps its saved coupon amount after reload, ahead of the form", () => {
  const cart = addItem(emptyOnlineCart(restaurant), { ...item, salePriceCents: 990 });
  const coupon = { code: "ESTATE15", percentOff: 15 };
  const pending = createOnlineIntent(cart, { ...form, coupon }, requestId);
  const restored = restoreOnlineCart(JSON.stringify({ ...cart, pending }), restaurant);
  const expected = {
    itemsCents: 990,
    coupon,
    discountCents: 148,
    totalCents: 842,
    deliveryFeeCents: null,
    payableCents: 842,
  };

  assert.deepEqual(onlineCartAmounts(restored, null, form), expected);
  assert.deepEqual(
    onlineCartAmounts(restored, cart, { ...form, coupon: { code: "ALTRO50", percentOff: 50 } }),
    expected,
  );

  // An explicit null in the saved intent must not fall back to a coupon in the checkout form.
  const withoutCoupon = { ...cart, pending: createOnlineIntent(cart, form, requestId) };
  assert.deepEqual(onlineCartAmounts(withoutCoupon, cart, { coupon }), {
    itemsCents: 990,
    coupon: null,
    discountCents: 0,
    totalCents: 990,
    deliveryFeeCents: null,
    payableCents: 990,
  });
});

test("source-cap refusals prove an unknown submission was not stored, browser-cookie failures do not", () => {
  for (const code of ["ONLINE_BROWSER_PENDING", "ONLINE_IP_WAITING_LIMIT"]) {
    assert.equal(submissionFailure(409, code, false), "editable");
    assert.equal(submissionFailure(409, code, true), "editable");
  }
  assert.equal(submissionFailure(400, "ONLINE_BROWSER_REQUIRED", false), "editable");
  assert.equal(submissionFailure(400, "ONLINE_BROWSER_REQUIRED", true), "unknown");
});

test("a browser conflict link requires a valid token, number and expiry", () => {
  const submission = { statusToken: "A".repeat(43), number: 1, expiresAt: "2026-11-16T12:10:00Z" };
  assert.deepEqual(existingSubmission(submission), submission);
  for (const value of [
    null,
    {},
    { ...submission, number: -1 },
    { ...submission, statusToken: "/unsafe" },
    { ...submission, expiresAt: "invalid" },
  ]) {
    assert.equal(existingSubmission(value), null);
  }
});

test("Turnstile failure frees a first rejected intent but preserves an unknown result", () => {
  assert.equal(submissionFailure(400, "ONLINE_VERIFICATION_FAILED", false), "editable");
  assert.equal(submissionFailure(400, "ONLINE_VERIFICATION_FAILED", true), "unknown");
  assert.equal(submissionFailure(503, "ONLINE_VERIFICATION_UNAVAILABLE", false), "unknown");
  assert.equal(submissionFailure(503, "ONLINE_VERIFICATION_UNAVAILABLE", true), "unknown");
});

const quoted: AddressQuote = {
  address: "Via Roma 1, Milano",
  result: "QUOTED",
  town: "Milano",
  distanceMeters: 2500,
  feeCents: 200,
  quote: "signed-quote",
};

test("a delivery quote counts only for the address it was asked about", () => {
  assert.equal(normalizeAddress("  Via   Roma 1,\tMilano "), "Via Roma 1, Milano");
  const form = { ...delivery, quote: quoted };
  assert.equal(currentQuote(form), quoted);
  assert.equal(feeStatus(form, true), "QUOTED");
  assert.equal(feeStatus(form, false), "manual");
  // Spacing does not change the address; anything else needs a new lookup.
  assert.equal(feeStatus({ ...form, address: " Via Roma  1, Milano" }, true), "QUOTED");
  assert.equal(feeStatus({ ...form, address: "Via Roma 10, Milano" }, true), "lookup");
  assert.equal(feeStatus({ ...delivery, quote: null }, true), "lookup");
  assert.equal(
    feeStatus({ ...form, quote: { ...quoted, result: "OUT_OF_RANGE", feeCents: null } }, true),
    "OUT_OF_RANGE",
  );

  assert.deepEqual(createOnlineIntent(filled(), form, requestId).deliveryQuote, {
    quote: "signed-quote",
    feeCents: 200,
  });
  for (const other of [
    { ...form, fulfillment: "PICKUP" as const },
    { ...form, address: "Via Roma 10, Milano" },
    { ...form, quote: { ...quoted, result: "UNKNOWN" as const, feeCents: null, quote: null } },
  ])
    assert.equal(createOnlineIntent(filled(), other, requestId).deliveryQuote, null);
});

test("a quoted fee joins the total during checkout and stays with an unknown submission", () => {
  const cart = filled();
  const form = { ...delivery, quote: quoted };
  const amounts = onlineCartAmounts(cart, cart, form);
  assert.equal(amounts.deliveryFeeCents, 200);
  assert.equal(amounts.payableCents, amounts.totalCents + 200);
  // Editing the cart shows the dishes only; the delivery minimum never counts the fee.
  assert.equal(onlineCartAmounts(cart, null, form).deliveryFeeCents, null);

  const pending = createOnlineIntent(cart, form, requestId);
  const saved = JSON.stringify({ ...cart, pending });
  const restored = restoreOnlineCart(saved, restaurant);
  assert.deepEqual(restored.pending, pending);
  assert.equal(onlineCartAmounts(restored, null, { ...delivery }).deliveryFeeCents, 200);
  // A pickup intent never carries a quote: such a saved intent is damaged.
  throwsIssue(
    () =>
      restoreOnlineCart(
        JSON.stringify({ ...cart, pending: { ...pending, fulfillment: "PICKUP" } }),
        restaurant,
      ),
    "damaged",
  );
});
