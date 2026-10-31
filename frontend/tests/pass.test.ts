import assert from "node:assert/strict";
import { test } from "node:test";
import type { PassItem } from "../src/features/pass/api.ts";
import { groupByTable, passWaitLevel } from "../src/features/pass/state.ts";
import { watermarkAdvanced } from "../src/lib/live-view.ts";

const dish = (id: string, sessionId: string, tableLabel: string, readyAt: string): PassItem => ({
  id,
  orderId: "order",
  sessionId,
  channel: "DINE_IN",
  tableLabel,
  pickup: null,
  defaultLanguage: "it",
  itemCode: null,
  nameZh: "炒饭",
  nameIt: null,
  nameEn: null,
  quantity: 1,
  remark: null,
  readyAt,
  servedAt: null,
});

test("dishes are grouped per visit, the longest-waiting table first, in ready order", () => {
  const tables = groupByTable([
    dish("a", "s2", "5", "2026-10-27T12:00:00Z"),
    dish("b", "s1", "8", "2026-10-27T12:01:00Z"),
    dish("c", "s2", "5", "2026-10-27T12:02:00Z"),
  ]);
  assert.deepEqual(
    tables.map((t) => [t.tableLabel, t.items.map((i) => i.id)]),
    [
      ["5", ["a", "c"]],
      ["8", ["b"]],
    ],
  );
  assert.deepEqual(groupByTable([]), []);
});

test("only a newly ready dish during continuous polling chimes", () => {
  const first = watermarkAdvanced(null, "2026-10-27T12:00:00Z", 1000);
  assert.equal(first.advanced, false); // First load establishes a silent baseline.
  assert.equal(watermarkAdvanced(first.baseline, "2026-10-27T12:00:00Z", 11_000).advanced, false);
  const next = watermarkAdvanced(first.baseline, "2026-10-27T12:00:05Z", 11_000);
  assert.equal(next.advanced, true);
  // Serving the newest dish or closing a table lowers the watermark silently...
  const served = watermarkAdvanced(next.baseline, "2026-10-27T11:59:00Z", 21_000);
  assert.equal(served.advanced, false);
  assert.equal(watermarkAdvanced(next.baseline, null, 21_000).advanced, false);
  // ...and a dish made ready afterwards still announces itself.
  assert.equal(watermarkAdvanced(served.baseline, "2026-10-27T12:00:06Z", 31_000).advanced, true);
  // A stale connection, a resume or a repeated poll establishes a baseline instead.
  assert.equal(watermarkAdvanced(next.baseline, "2026-10-27T12:10:00Z", 50_000).advanced, false);
  assert.equal(watermarkAdvanced(null, "2026-10-27T12:10:00Z", 50_000).advanced, false);
  assert.equal(watermarkAdvanced(next.baseline, "2026-10-27T12:10:00Z", 11_000).advanced, false);
});

test("a dish waiting five minutes at the pass is highlighted", () => {
  assert.equal(passWaitLevel(0), "normal");
  assert.equal(passWaitLevel(4), "normal");
  assert.equal(passWaitLevel(5), "late");
});
