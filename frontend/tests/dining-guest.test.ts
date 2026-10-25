import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePendingAction,
  pendingDiningKey,
  recoveredOpen,
} from "../src/features/dining/state.ts";
import { readVisit, reconcileVisit, accessOutcome } from "../src/features/guests/state.ts";

test("unknown opening survives reload as a read-only recovery intent, scoped to the signed-in account", () => {
  const saved = JSON.stringify({ kind: "open", tableId: "table-8" });
  assert.deepEqual(parsePendingAction(saved), { kind: "open", tableId: "table-8" });
  assert.deepEqual(recoveredOpen("session-a"), { kind: "active", sessionId: "session-a" });
  assert.deepEqual(recoveredOpen(null), { kind: "confirm-again" });
  assert.notEqual(pendingDiningKey("restaurant", "staff"), pendingDiningKey("restaurant", "owner"));
  assert.notEqual(pendingDiningKey("restaurant", "staff"), pendingDiningKey("another", "staff"));
});

test("malformed or retired pending floor actions cannot create a recovery intent", () => {
  // Closing moved to the billing panel, so an old floor "close" marker is ignored rather than recovered here.
  for (const raw of [
    null,
    "{",
    '{"kind":"open"}',
    '{"kind":"delete","tableId":"8"}',
    JSON.stringify({ kind: "close", tableId: "8", sessionId: "old-session" }),
  ])
    assert.equal(parsePendingAction(raw), null);
});

test("closing and reopening cannot silently move a guest into the next session", () => {
  const visit = { sessionId: "first", skipped: false, ended: false };
  for (const current of [null, "second"]) {
    const ended = reconcileVisit(visit, current);
    assert.deepEqual(ended, { ...visit, ended: true });
    assert.deepEqual(reconcileVisit(ended, "third"), ended);
    assert.deepEqual(readVisit(JSON.stringify(ended)), ended);
  }
});

test("an unopened table can acquire its first session; skipping survives refresh within that session", () => {
  const opened = reconcileVisit({ sessionId: null, skipped: false, ended: false }, "first");
  assert.deepEqual(opened, { sessionId: "first", skipped: false, ended: false });
  const skipped = { ...opened, skipped: true };
  assert.deepEqual(reconcileVisit(readVisit(JSON.stringify(skipped))!, "first"), skipped);
  const restored = readVisit(JSON.stringify({ ...skipped, joinCode: "SECRET", cookie: "SECRET" }));
  assert.deepEqual(restored, skipped); // Tab storage has no place for credentials or code values.
});

test("expired or replaced credentials require verification without falsely closing the session", () => {
  assert.equal(accessOutcome("GUEST_AUTH_REQUIRED"), "unverified");
  assert.equal(accessOutcome("GUEST_SESSION_MISMATCH"), "unverified");
  assert.equal(accessOutcome("SESSION_CLOSED"), "ended");
  assert.equal(accessOutcome("INTERNAL_ERROR"), null);
});
