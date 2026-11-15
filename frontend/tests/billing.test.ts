import test from "node:test";
import assert from "node:assert/strict";
import {
  billAmounts,
  canEditDeliveryFee,
  closureKind,
  confirmationChanged,
  closureRequest,
  readClosures,
  recoveryPath,
  historySearch,
  closureKey,
  deliveryFeeRequest,
  noShowAllowed,
  totalWithFee,
  type BillSummary,
  type Confirmation,
} from "../src/features/billing/state.ts";

const id = "11111111-1111-4111-8111-111111111111";
const bill: BillSummary = {
  sessionId: id,
  channel: "DINE_IN",
  tableId: id,
  tableLabel: "8",
  online: null,
  status: "ACTIVE",
  openedAt: "2026-10-23T12:00:00Z",
  closedAt: null,
  closeReason: null,
  deliveryFeeCents: null,
  billVersion: 3,
  orderCount: 2,
  itemCount: 2,
  newItemCount: 0,
  cancelledItemCount: 0,
  totalAmountCents: 1400,
};

test("only the owner can pay a positive bill; NEW or CLOSED blocks closure", () => {
  assert.equal(closureKind(bill, "OWNER"), "PAID");
  assert.equal(closureKind(bill, "STAFF"), null);
  assert.equal(closureKind({ ...bill, newItemCount: 1 }, "OWNER"), null);
  assert.equal(closureKind({ ...bill, status: "CLOSED" }, "OWNER"), null);
});
test("empty and fully cancelled visits have different zero closure rules", () => {
  assert.equal(closureKind({ ...bill, orderCount: 0, totalAmountCents: 0 }, "STAFF"), "EMPTY");
  assert.equal(
    closureKind({ ...bill, cancelledItemCount: 2, totalAmountCents: 0 }, "STAFF"),
    "VOIDED",
  );
  assert.equal(closureKind({ ...bill, cancelledItemCount: 1, totalAmountCents: 0 }, "OWNER"), null);
});
test("confirmation keeps its original amount and version after a background change", () => {
  const snapshot: Confirmation = { kind: "PAID", bill: { ...bill } };
  const updated = { ...bill, billVersion: 4, totalAmountCents: 2100 };
  assert.equal(confirmationChanged(snapshot, updated), true);
  assert.deepEqual(closureRequest(snapshot), {
    path: `/api/owner/sessions/${id}/checkout`,
    body: { expectedBillVersion: 3, confirmedTotalCents: 1400 },
  });
  assert.equal(confirmationChanged(snapshot, { ...bill }), false);
});
test("closure or a changed visit invalidates the old confirmation", () => {
  const snapshot: Confirmation = { kind: "PAID", bill };
  assert.equal(confirmationChanged(snapshot, { ...bill, status: "CLOSED" }), true);
  assert.equal(confirmationChanged(snapshot, { ...bill, sessionId: "other" }), true);
  assert.equal(confirmationChanged(snapshot, { ...bill, newItemCount: 1 }), true);
});
test("zero closure explicitly confirms departure and never uses checkout", () => {
  for (const kind of ["EMPTY", "VOIDED"] as const) {
    const request = closureRequest({ kind, bill: { ...bill, totalAmountCents: 0 } });
    assert.equal(
      request.path,
      `/api/staff/sessions/${id}/${kind === "EMPTY" ? "close-empty" : "close-void"}`,
    );
    assert.deepEqual(request.body, {
      expectedBillVersion: 3,
      confirmedTotalCents: 0,
      guestsLeftConfirmed: true,
    });
  }
});
test("reload recovery retains only original visit and closure kind", () => {
  const rows = readClosures(
    JSON.stringify([
      { sessionId: id, kind: "PAID", amount: 1400, secret: "ignored" },
      { sessionId: id, kind: "EMPTY" },
      { sessionId: "bad", kind: "PAID" },
    ]),
  );
  assert.deepEqual(rows, [{ sessionId: id, kind: "PAID" }]);
  assert.equal(recoveryPath(rows[0]), `/api/staff/sessions/${id}`);
  assert.deepEqual(readClosures("broken"), []);
  assert.deepEqual(readClosures("{}"), []);
});
test("history URL keeps exact filter values and validates session identifiers", () => {
  assert.deepEqual(
    historySearch({
      sessionId: id,
      fromDate: "2026-10-23",
      toDate: "2026-10-25",
      tableLabel: " 8 ",
      closeReason: "VOIDED",
    }),
    {
      sessionId: id,
      fromDate: "2026-10-23",
      toDate: "2026-10-25",
      tableLabel: "8",
      closeReason: "VOIDED",
    },
  );
  const invalid = historySearch({
    sessionId: "../../other",
    closeReason: "unknown",
    fromDate: "bad",
  });
  assert.equal(invalid.sessionId, undefined);
  assert.equal(invalid.closeReason, undefined);
  assert.equal(invalid.fromDate, undefined);
});
test("pending closure metadata is scoped to the account and restaurant", () => {
  assert.notEqual(closureKey("restaurant", "owner"), closureKey("restaurant", "staff"));
  assert.notEqual(closureKey("restaurant", "owner"), closureKey("other", "owner"));
});

test("an online order the owner could check out may instead close as not collected", () => {
  const online = {
    ...bill,
    channel: "PICKUP" as const,
    tableId: null,
    tableLabel: null,
    online: {
      number: 12,
      customerName: "Marco",
      customerPhone: "+393331234567",
      estimatedAt: "2026-10-23T12:30:00Z",
      deliveryAddress: null,
      deliveryNotes: null,
    },
  };
  assert.equal(noShowAllowed(online, "OWNER"), true);
  assert.equal(noShowAllowed(online, "STAFF"), false);
  assert.equal(noShowAllowed(bill, "OWNER"), false);
  assert.equal(noShowAllowed({ ...online, newItemCount: 1 }, "OWNER"), false);
  assert.equal(
    noShowAllowed({ ...online, totalAmountCents: 0, cancelledItemCount: 2 }, "OWNER"),
    false,
  );
  assert.deepEqual(closureRequest({ kind: "NO_SHOW", bill: online }), {
    path: `/api/owner/sessions/${id}/close-no-show`,
    body: { expectedBillVersion: 3, confirmedTotalCents: 1400, noShowConfirmed: true },
  });
  assert.deepEqual(readClosures(JSON.stringify([{ sessionId: id, kind: "NO_SHOW" }])), [
    { sessionId: id, kind: "NO_SHOW" },
  ]);
  assert.equal(historySearch({ closeReason: "NO_SHOW" }).closeReason, "NO_SHOW");
});

test("a delivery bill splits into dishes and a fee that stops counting once every dish is cancelled", () => {
  const delivery = {
    ...bill,
    channel: "DELIVERY" as const,
    tableLabel: null,
    deliveryFeeCents: 300,
    itemCount: 2,
    cancelledItemCount: 1,
    totalAmountCents: 1500,
  };
  assert.deepEqual(billAmounts(delivery), { fee: 300, feeCounted: true, items: 1200 });
  assert.deepEqual(billAmounts({ ...delivery, cancelledItemCount: 2, totalAmountCents: 0 }), {
    fee: 300,
    feeCounted: false,
    items: 0,
  });
  assert.deepEqual(billAmounts(bill), {
    fee: null,
    feeCounted: false,
    items: bill.totalAmountCents,
  });
  assert.equal(totalWithFee(delivery, 150), 1350);
  assert.equal(totalWithFee({ ...delivery, cancelledItemCount: 2, totalAmountCents: 0 }, 150), 0);

  assert.equal(canEditDeliveryFee(delivery, "OWNER"), true);
  assert.equal(canEditDeliveryFee(delivery, "STAFF"), false);
  assert.equal(canEditDeliveryFee({ ...delivery, status: "CLOSED" }, "OWNER"), false);
  assert.equal(canEditDeliveryFee({ ...delivery, channel: "PICKUP" }, "OWNER"), false);
  assert.deepEqual(deliveryFeeRequest({ ...delivery, billVersion: 3 }, 150), {
    path: `/api/owner/sessions/${delivery.sessionId}/delivery-fee`,
    body: { expectedBillVersion: 3, deliveryFeeCents: 150 },
  });
});
