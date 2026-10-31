import test from "node:test";
import assert from "node:assert/strict";
import {
  closureKind,
  confirmationChanged,
  closureRequest,
  readClosures,
  recoveryPath,
  canAcceptResult,
  historySearch,
  closureKey,
  type BillSummary,
  type Confirmation,
} from "../src/features/billing/state.ts";

const id = "11111111-1111-4111-8111-111111111111";
const bill: BillSummary = {
  sessionId: id,
  channel: "DINE_IN",
  tableId: id,
  tableLabel: "8",
  status: "ACTIVE",
  openedAt: "2026-10-23T12:00:00Z",
  closedAt: null,
  closeReason: null,
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
test("late results cannot apply after lifecycle or account changes", () => {
  assert.equal(canAcceptResult(true, 2, 2, false, true), true);
  for (const args of [
    [false, 2, 2, false, true],
    [true, 2, 3, false, true],
    [true, 2, 2, true, true],
    [true, 2, 2, false, false],
  ] as const)
    assert.equal(canAcceptResult(...args), false);
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
