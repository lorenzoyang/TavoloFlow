import assert from "node:assert/strict";
import { test } from "node:test";
import { arrivals, canCancel, pendingKitchenKey, readPending, recoveryOutcome,
  type PendingKitchenAction } from "../src/features/kitchen/state.ts";
import { syncIsFresh } from "../src/lib/live-view.ts";
import { isPrivateQuery } from "../src/lib/query-scope.ts";

const action: PendingKitchenAction = { orderId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002", kind: "cancel", expectedStatus: "NEW" };

test("unknown operations survive reload with only scoped identifiers and never carry replay bodies", () => {
  const stored = JSON.stringify([{ ...action, reason: "private reason", items: ["private order"], cookie: "secret" }, action]);
  assert.deepEqual(readPending(stored), [action]);
  assert.notEqual(pendingKitchenKey("a", "staff"), pendingKitchenKey("b", "staff"));
  assert.notEqual(pendingKitchenKey("a", "staff"), pendingKitchenKey("a", "owner"));
  for (const raw of [null, "{", "{}", '[null]', JSON.stringify([{ ...action, orderId: "../another" }]),
    JSON.stringify([{ ...action, kind: "ready", expectedStatus: "READY" }])]) assert.deepEqual(readPending(raw), []);
});

test("GET recovery distinguishes achieved target, changed state and a fresh human confirmation", () => {
  assert.equal(recoveryOutcome(action, "CANCELLED"), "reached");
  assert.equal(recoveryOutcome(action, "READY"), "changed");
  assert.equal(recoveryOutcome(action, "NEW"), "confirm-again");
  assert.equal(recoveryOutcome({ ...action, kind: "ready" }, "CANCELLED"), "changed");
  assert.equal(recoveryOutcome({ ...action, kind: "ready" }, "READY"), "reached");
  assert.equal(canCancel("STAFF", "READY"), false);
  assert.equal(canCancel("OWNER", "READY"), true);
  assert.equal(canCancel("OWNER", "CANCELLED"), false);
});

test("arrival detection works beyond the displayed page and does not alarm on processing or reconnect", () => {
  const first = arrivals(null, 120, 1000);
  assert.equal(first.added, 0);
  assert.equal(arrivals(first.baseline, 120, 11_000).added, 0); // Completion/cancellation does not change the creation count.
  const incoming = arrivals(first.baseline, 123, 11_000);
  assert.equal(incoming.added, 3); // One chime for the batch, even when none are on the oldest page.
  assert.equal(arrivals(incoming.baseline, 123, 11_000).added, 0); // Page append / repeated render.
  assert.equal(arrivals(incoming.baseline, 130, 41_000).added, 0); // Stale connection establishes a baseline.
  assert.equal(arrivals(null, 150, 42_000).added, 0); // Sound enable, foreground resume or identity change.
  assert.equal(arrivals(incoming.baseline, 10, 21_000).added, 0); // A counter decrease also resets safely.
});

test("stale and resumed views cannot authorize UI writes before a fresh successful poll", () => {
  assert.equal(syncIsFresh(1000, 30_999, 1000, true, false), true);
  assert.equal(syncIsFresh(1000, 31_000, 1000, true, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1001, true, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1000, false, false), false);
  assert.equal(syncIsFresh(1000, 2000, 1000, true, true), false);
  assert.equal(syncIsFresh(0, 2000, 0, true, false), false);
  assert.equal(isPrivateQuery({ queryKey: ["kitchen", "restaurant", "staff", "NEW"] }), true);
});
