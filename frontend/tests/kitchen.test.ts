import assert from "node:assert/strict";
import { test } from "node:test";
import type { KitchenOrder } from "../src/features/kitchen/api.ts";
import type { OrderLine } from "../src/features/orders/api.ts";
import {
  arrivals,
  canCancel,
  dishGroups,
  pendingKitchenKey,
  readPending,
  recoveryOutcome,
  waitLevel,
  type PendingKitchenAction,
} from "../src/features/kitchen/state.ts";
import { syncIsFresh, syncIsStalled } from "../src/lib/live-view.ts";

const action: PendingKitchenAction = {
  orderId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  kind: "cancel",
  itemId: "00000000-0000-4000-8000-000000000003",
};

test("unknown operations survive reload with only scoped identifiers and never carry replay bodies", () => {
  const stored = JSON.stringify([
    { ...action, reason: "private reason", items: ["private order"], cookie: "secret" },
    action,
  ]);
  assert.deepEqual(readPending(stored), [action]);
  assert.notEqual(pendingKitchenKey("a", "staff"), pendingKitchenKey("b", "staff"));
  assert.notEqual(pendingKitchenKey("a", "staff"), pendingKitchenKey("a", "owner"));
  for (const raw of [
    null,
    "{",
    "{}",
    "[null]",
    JSON.stringify([{ ...action, orderId: "../another" }]),
    JSON.stringify([{ ...action, itemId: "invalid" }]),
  ])
    assert.deepEqual(readPending(raw), []);
});

test("GET recovery distinguishes achieved target, changed state and a fresh human confirmation", () => {
  assert.equal(recoveryOutcome(action, "CANCELLED"), "reached");
  assert.equal(recoveryOutcome(action, "READY"), "changed");
  assert.equal(recoveryOutcome(action, "NEW"), "confirm-again");
  assert.equal(recoveryOutcome({ ...action, kind: "ready" }, "CANCELLED"), "changed");
  assert.equal(recoveryOutcome({ ...action, kind: "ready" }, "READY"), "reached");
  assert.equal(canCancel("READY"), false);
  assert.equal(canCancel("NEW"), true);
  assert.equal(canCancel("CANCELLED"), false);
});

test("arrival detection works beyond the displayed page and does not alarm on processing or reconnect", () => {
  const first = arrivals(null, 120, 1000);
  assert.equal(first.added, 0);
  assert.equal(arrivals(first.baseline, 120, 11_000).added, 0); // Completion/cancellation does not change the creation count.
  const incoming = arrivals(first.baseline, 123, 11_000);
  assert.equal(incoming.added, 3); // One chime for the batch, even when none are on the oldest page.
  assert.equal(arrivals(incoming.baseline, 123, 11_000).added, 0); // Page append / repeated render.
  assert.equal(arrivals(incoming.baseline, 130, 41_000).added, 0); // Stale connection establishes a baseline.
  assert.equal(arrivals(null, 150, 42_000).added, 0); // Foreground resume, reconnect or identity change.
  assert.equal(arrivals(incoming.baseline, 10, 21_000).added, 0); // A counter decrease also resets safely.
});

test("stale and resumed views cannot authorize UI writes before a fresh successful poll", () => {
  assert.equal(syncIsFresh(1000, 30_999, 1000, true, false), true);
  assert.equal(syncIsFresh(1000, 31_000, 1000, true, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1001, true, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1000, false, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1000, true, true), false);
  assert.equal(syncIsFresh(0, 2000, 0, true, false), false);
});

test("a first poll after loading, resuming or switching tabs is not reported until the grace ends", () => {
  assert.equal(syncIsStalled(false, 1500, 1000, true, false), false); // Still syncing: no warning flash.
  assert.equal(syncIsStalled(false, 900, 1000, true, false), false); // The 1-second clock lags the switch.
  assert.equal(syncIsStalled(false, 4000, 1000, true, false), true); // Syncing too long, or aged out.
  assert.equal(syncIsStalled(false, 1500, 1000, false, false), true); // Offline or hidden: at once.
  assert.equal(syncIsStalled(false, 1500, 1000, true, true), true); // Failed poll: at once.
  assert.equal(syncIsStalled(true, 99_000, 1000, true, false), false);
});

test("waiting orders turn amber at 10 minutes and red at 20", () => {
  assert.equal(waitLevel(0), "normal");
  assert.equal(waitLevel(9), "normal");
  assert.equal(waitLevel(10), "late");
  assert.equal(waitLevel(19), "late");
  assert.equal(waitLevel(20), "overdue");
});

test("legacy whole-order markers are retained only for GET review, never treated as item writes", () => {
  const { itemId: _item, ...legacy } = action;
  const pending = readPending(
    JSON.stringify([{ ...legacy, expectedStatus: "READY", reason: "old" }]),
  );
  assert.deepEqual(pending, [{ ...legacy, itemId: null }]);
  assert.equal(recoveryOutcome(pending[0], undefined), "legacy-reviewed");
  assert.deepEqual(readPending(JSON.stringify(pending)), pending);
  assert.equal(recoveryOutcome(action, undefined), "missing");
});

const rice = "00000000-0000-4000-8000-0000000000a1";
const dumplings = "00000000-0000-4000-8000-0000000000a2";
const dish = (
  id: string,
  menuItemId: string | null,
  name: string,
  patch: Partial<OrderLine> = {},
) =>
  ({
    id,
    menuItemId,
    itemCode: null,
    nameZh: name,
    nameIt: null,
    nameEn: null,
    allergenCodes: [],
    unitPriceCents: 800,
    quantity: 1,
    remark: null,
    status: "NEW",
    readyAt: null,
    cancelledAt: null,
    ...patch,
  }) satisfies OrderLine;
const ticket = (id: string, table: string, createdAt: string, items: OrderLine[]) =>
  ({
    id,
    sessionId: action.sessionId,
    tableLabel: table,
    status: "NEW",
    createdAt,
    processedAt: null,
    defaultLanguage: "zh",
    totalAmountCents: 0,
    payableAmountCents: 0,
    items,
  }) satisfies KitchenOrder;

test("dish groups gather one dish across orders, the longest wait first", () => {
  const t1 = ticket("00000000-0000-4000-8000-000000000011", "1", "2026-10-28T12:00:00Z", [
    dish("00000000-0000-4000-8000-000000000101", rice, "炒饭"),
  ]);
  const t3 = ticket("00000000-0000-4000-8000-000000000013", "3", "2026-10-28T12:01:00Z", [
    dish("00000000-0000-4000-8000-000000000301", dumplings, "饺子", {
      quantity: 2,
      allergenCodes: ["GLUTEN"],
    }),
    dish("00000000-0000-4000-8000-000000000302", rice, "炒饭", { remark: "不要葱" }),
    dish("00000000-0000-4000-8000-000000000303", rice, "炒饭", {
      status: "READY",
      readyAt: "2026-10-28T12:05:00Z",
    }),
  ]);
  const t4 = ticket("00000000-0000-4000-8000-000000000014", "4", "2026-10-28T12:02:00Z", [
    dish("00000000-0000-4000-8000-000000000401", rice, "炒饭", {
      quantity: 2,
      allergenCodes: ["SOY"],
    }),
    dish("00000000-0000-4000-8000-000000000402", dumplings, "饺子", {
      status: "CANCELLED",
      cancelledAt: "2026-10-28T12:03:00Z",
    }),
  ]);
  // Loaded pages arrive in any order; the grouping does not depend on it.
  const groups = dishGroups([t4, t1, t3]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.quantity, g.lines.map((l) => l.order.tableLabel)]),
    [
      [rice, 4, ["1", "3", "4"]],
      [dumplings, 2, ["3"]],
    ],
  );
  // A remark stays on its own line inside the group; terminal lines never appear.
  assert.equal(groups[0].lines[1].line.remark, "不要葱");
  assert.deepEqual(groups[0].allergenCodes, ["SOY"]);
  assert.deepEqual(groups[1].allergenCodes, ["GLUTEN"]);
  assert.deepEqual(dishGroups([]), []);
});

test("dishes deleted from the menu are matched by their snapshot", () => {
  const groups = dishGroups([
    ticket("00000000-0000-4000-8000-000000000021", "1", "2026-10-28T12:00:00Z", [
      dish("00000000-0000-4000-8000-000000000201", null, "旧炒饭"),
      dish("00000000-0000-4000-8000-000000000202", null, "旧面"),
    ]),
    ticket("00000000-0000-4000-8000-000000000022", "2", "2026-10-28T12:00:00Z", [
      dish("00000000-0000-4000-8000-000000000203", null, "旧炒饭", { quantity: 3 }),
    ]),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.lines[0].line.nameZh, g.quantity]),
    [
      ["旧炒饭", 4],
      ["旧面", 1],
    ],
  );
});
