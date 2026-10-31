import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, CartError, persistCart, pickupCartKey } from "../src/features/orders/state.ts";
import {
  contactProblem,
  createPickupIntent,
  emptyPickupCart,
  orderTokenKey,
  pickupFailure,
  readOrderToken,
  restorePickupCart,
  saveOrderToken,
  statusView,
} from "../src/features/online-order/state.ts";

const item = {
  id: "00000000-0000-4000-8000-000000000001",
  categoryId: "category",
  nameZh: "炒饭",
  nameIt: "Riso",
  nameEn: "Rice",
  descriptionZh: null,
  descriptionIt: null,
  descriptionEn: null,
  itemCode: null,
  priceCents: 700,
  isAvailable: true,
  allergenReviewed: true,
  allergenCodes: [],
};
const id = "00000000-0000-4000-8000-000000000003";
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

test("the contact needs a one-line name of 1–20 characters and a valid phone", () => {
  assert.equal(contactProblem(" Marco ", "+39 333 123 4567"), null);
  assert.equal(contactProblem("   ", "3331234567"), "name");
  assert.equal(contactProblem("x".repeat(21), "3331234567"), "name");
  assert.equal(contactProblem("Mar\nco", "3331234567"), "name");
  assert.equal(contactProblem("Marco", "12345"), "phone");
});

test("the frozen request round-trips through storage and refuses tampering", () => {
  const cart = addItem(emptyPickupCart("r"), item);
  const pending = createPickupIntent(
    { ...cart, lines: [{ ...cart.lines[0], remark: " less salt " }] },
    " Marco ",
    "333 1234567",
    id,
  );
  assert.deepEqual(pending, {
    clientRequestId: id,
    customerName: "Marco",
    customerPhone: "3331234567",
    items: [{ menuItemId: item.id, quantity: 1, expectedUnitPriceCents: 700, remark: "less salt" }],
  });
  assert.throws(() => createPickupIntent(cart, "", "3331234567", id), CartError);
  assert.throws(
    () => createPickupIntent(emptyPickupCart("r"), "Marco", "3331234567", id),
    CartError,
  );
  const storage = memory();
  const frozen = { ...cart, lines: [{ ...cart.lines[0], remark: " less salt " }], pending };
  persistCart(storage, pickupCartKey("r"), frozen);
  const restored = restorePickupCart(storage.getItem(pickupCartKey("r")), emptyPickupCart("r"));
  assert.deepEqual(restored.pending, pending);
  // A pending request that no longer matches its frozen lines must never be sent.
  const tampered = JSON.stringify({
    ...frozen,
    pending: { ...pending, items: [{ ...pending.items[0], quantity: 2 }] },
  });
  assert.throws(
    () => restorePickupCart(tampered, emptyPickupCart("r")),
    (e: unknown) => e instanceof CartError && e.issue === "damaged",
  );
  assert.throws(
    () => restorePickupCart(JSON.stringify(frozen), emptyPickupCart("other")),
    CartError,
  );
});

test("only an understood first rejection releases the frozen request", () => {
  for (const code of [
    "MENU_CHANGED",
    "PICKUP_CLOSED",
    "PICKUP_BUSY",
    "PICKUP_PAUSED",
    "VALIDATION_FAILED",
  ])
    assert.equal(pickupFailure(409, code, false), "editable", code);
  assert.equal(pickupFailure(409, "PICKUP_BUSY", true), "unknown");
  assert.equal(pickupFailure(null, null, false), "unknown");
  assert.equal(pickupFailure(502, "BAD_GATEWAY", false), "unknown");
  assert.equal(pickupFailure(400, "SOMETHING_ELSE", false), "unknown");
});

test("the status page leads with the phone when the guest has to call", () => {
  assert.deepEqual(statusView("PENDING", null), {
    headline: "PENDING",
    callFirst: false,
    finished: false,
  });
  assert.deepEqual(statusView("REJECTED", null), {
    headline: "rejected",
    callFirst: true,
    finished: true,
  });
  assert.deepEqual(statusView("REJECTED", "SOLD_OUT"), {
    headline: "rejected_SOLD_OUT",
    callFirst: true,
    finished: true,
  });
  assert.deepEqual(statusView("EXPIRED", null), {
    headline: "EXPIRED",
    callFirst: true,
    finished: true,
  });
  // All dishes cancelled: the visit is still open until the owner closes it, so the page keeps polling.
  assert.deepEqual(statusView("CANCELLED", null), {
    headline: "CANCELLED",
    callFirst: true,
    finished: false,
  });
  assert.equal(statusView("READY", null).finished, false);
  assert.equal(statusView("PICKED_UP", null).finished, true);
  assert.equal(statusView("CLOSED", null).finished, true);
});

test("the latest order token is kept per restaurant and must look like a token", () => {
  const storage = memory();
  const token = "A".repeat(42) + "_";
  assert.equal(readOrderToken("r", storage), null);
  saveOrderToken("r", token, storage);
  assert.equal(readOrderToken("r", storage), token);
  assert.equal(readOrderToken("other", storage), null);
  storage.setItem(orderTokenKey("r"), "../../staff");
  assert.equal(readOrderToken("r", storage), null);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readOrderToken("r", broken), null);
});
