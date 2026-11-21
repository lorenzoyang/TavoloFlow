import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCalendarMonths,
  periodTotal,
  periodFromForm,
  renewalStart,
} from "../src/features/subscriptions/state.ts";
import { randomUuid } from "../src/lib/ids.ts";

test("agreed term uses start date and calendar months, independent of payment date", () => {
  assert.equal(addCalendarMonths("2026-11-01", 12), "2027-11-01");
  assert.equal(addCalendarMonths("2026-11-01", 24), "2028-11-01");
  assert.equal(addCalendarMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addCalendarMonths("2024-02-29", 48), "2028-02-29");
  assert.equal(addCalendarMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addCalendarMonths("2027-01-31", 1), "2027-02-28");
  for (const [date, months] of [
    ["2026-02-29", 1],
    ["2026-11-01", 0],
    ["2026-11-01", 1.5],
    ["9999-12-01", 1],
    ["bad", 1],
  ] as const)
    assert.equal(addCalendarMonths(date, months), null);
});
test("period totals preserve integer cents and reject unsafe arithmetic", () => {
  assert.equal(periodTotal(50050, 2), 100100);
  assert.equal(periodTotal(Number.MAX_SAFE_INTEGER, 2), null);
  assert.equal(periodTotal(null, 2), null);
  assert.equal(periodTotal(100, 0), null);
});
test("a paid cycle requires its actual payment date, while unpaid cycles keep it empty", () => {
  const form = new FormData();
  form.set("term-startsOn", "2026-11-01");
  form.set("term-months", "24");
  form.set("term-monthly-fee", "20");
  const id = randomUuid();
  assert.equal(periodFromForm(form, "term", id).paidOn, null);
  form.set("term-paid", "on");
  assert.throws(() => periodFromForm(form, "term", id));
  form.set("term-paidOn", "2026-11-03");
  const paid = periodFromForm(form, "term", id);
  assert.equal(paid.paidOn, "2026-11-03");
  assert.equal(paid.startsOn, "2026-11-01");
  assert.equal(paid.months, 24);
  assert.equal(paid.monthlyFeeCents, 2_000);
  assert.equal(periodTotal(paid.monthlyFeeCents, paid.months), 48_000);
});

test("a renewal starts at the latest agreed end, then the service expiry, then today", () => {
  const latest = {
    id: randomUuid(),
    startsOn: "2027-11-01",
    endsOn: "2029-11-01",
    months: 24,
    monthlyFeeCents: 3_750,
    amountCents: 90000,
    paidOn: null,
    isPaid: false,
  };
  const summary = { expiresOn: "2027-11-01", localToday: "2026-10-24" };
  assert.equal(renewalStart(latest, summary), "2029-11-01");
  assert.equal(renewalStart(undefined, summary), "2027-11-01");
  assert.equal(renewalStart(undefined, { ...summary, expiresOn: null }), "2026-10-24");
});
