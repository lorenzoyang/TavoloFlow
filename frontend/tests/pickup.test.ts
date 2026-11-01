import assert from "node:assert/strict";
import { test } from "node:test";
import { isSlug, normalizePhone, suggestSlug } from "../src/lib/pickup-rules.ts";
import { formatOpening } from "../src/lib/format.ts";
import { publicMenuUrl } from "../src/features/tables/qr-url.ts";
import { readPending } from "../src/features/platform/state.ts";
import {
  draftHours,
  hoursDraft,
  inputTime,
  parseTime,
  windowText,
  waitingPickups,
  type HourDraft,
} from "../src/features/pickup/state.ts";

test("expired cached requests stop authorizing cards and ringing at their expiry boundary", () => {
  const rows = [{ expiresAt: "2026-11-02T10:10:00Z" }, { expiresAt: "2026-11-02T10:11:00Z" }];
  assert.deepEqual(waitingPickups(rows, Date.parse("2026-11-02T10:10:00Z")), [rows[1]]);
  assert.deepEqual(waitingPickups(rows, Date.parse("2026-11-02T10:11:00Z")), []);
});

test("phones keep an optional plus and 6–15 digits, stored without spaces", () => {
  assert.equal(normalizePhone(" +39 333 123 4567 "), "+393331234567");
  assert.equal(normalizePhone("06\t1234567"), "061234567");
  for (const invalid of ["12345", "+39-333-1234567", "1234567890123456", "++39333", "phone", ""])
    assert.equal(normalizePhone(invalid), null, invalid);
});

test("link names are 3–40 lowercase letters, digits and inner hyphens", () => {
  for (const valid of ["abc", "trattoria-roma", "a1-b2", "x".repeat(40)]) assert.ok(isSlug(valid));
  for (const invalid of ["ab", "-abc", "abc-", "Abc", "a_b", "a b", "x".repeat(41)])
    assert.equal(isSlug(invalid), false, invalid);
  assert.equal(suggestSlug("Trattoria Dà Mario & Figli!"), "trattoria-da-mario-figli");
  assert.equal(suggestSlug("  Ramen   Ya  "), "ramen-ya");
  assert.equal(suggestSlug("面馆"), "");
  assert.equal(suggestSlug("Il " + "nome molto lungo ".repeat(5)).length <= 40, true);
  assert.ok(isSlug(suggestSlug("Il " + "nome molto lungo ".repeat(5))));
});

test("the online menu link is a public menu URL like a table's", () => {
  assert.equal(
    publicMenuUrl("/r/ramen-ya", "http://localhost:5173"),
    "http://localhost:5173/r/ramen-ya",
  );
  for (const path of ["/r/-ab", "/r/AB-C", "/r/ab", "/r/a/b", "/r/ab-c?x=1"])
    assert.throws(() => publicMenuUrl(path, "https://menu.example.com"), path);
});

test("hours drafts round-trip, read midnight as 24:00 and report the first problem", () => {
  const hours = [
    { weekday: 2, slot: 2, opensMinute: 1080, closesMinute: 1440 },
    { weekday: 2, slot: 1, opensMinute: 660, closesMinute: 870 },
  ];
  const draft = hoursDraft(hours);
  assert.equal(draft.length, 7);
  assert.deepEqual(draft[1].slots, [
    { opens: "11:00", closes: "14:30" },
    { opens: "18:00", closes: "00:00" },
  ]);
  assert.deepEqual(draftHours(draft), {
    hours: [
      { weekday: 2, slot: 1, opensMinute: 660, closesMinute: 870 },
      { weekday: 2, slot: 2, opensMinute: 1080, closesMinute: 1440 },
    ],
  });
  assert.equal(windowText(hours[0]), "18:00–24:00");
  assert.equal(inputTime(0), "00:00");
  assert.equal(parseTime("00:00", false), 0);
  assert.equal(parseTime("00:00", true), 1440);
  assert.equal(parseTime("24:00", true), null);
  const day = (slots: HourDraft["slots"]): HourDraft[] => [{ weekday: 3, slots }];
  assert.deepEqual(draftHours(day([{ opens: "", closes: "12:00" }])), {
    problem: "format",
    weekday: 3,
  });
  assert.deepEqual(draftHours(day([{ opens: "12:00", closes: "12:00" }])), {
    problem: "order",
    weekday: 3,
  });
  assert.deepEqual(
    draftHours(
      day([
        { opens: "11:00", closes: "15:00" },
        { opens: "14:59", closes: "22:00" },
      ]),
    ),
    { problem: "overlap", weekday: 3 },
  );
  // Touching windows are fine.
  assert.ok(
    "hours" in
      draftHours(
        day([
          { opens: "11:00", closes: "15:00" },
          { opens: "15:00", closes: "22:00" },
        ]),
      ),
  );
});

test("an opening later today shows only the time, another day adds the weekday", () => {
  const now = Date.parse("2026-11-02T09:00:00Z"); // Monday 10:00 in Rome
  assert.equal(formatOpening("2026-11-02T17:00:00Z", "zh", now), "18:00");
  assert.match(formatOpening("2026-11-04T17:00:00Z", "it", now), /^mer.* 18:00$/);
});

test("platform pending markers accept the service, phone and link actions", () => {
  const restaurantId = "11111111-1111-4111-8111-111111111111";
  for (const kind of ["services", "phone", "slug"])
    assert.equal(readPending(JSON.stringify({ kind, restaurantId }))?.kind, kind);
});
