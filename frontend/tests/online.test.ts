import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeProgress,
  formatCountdown,
  formatMinute,
  MAX_WAITING_REQUESTS,
  normalizePhone,
  pendingBanner,
  requestTimes,
  parseTime,
  sameHours,
  timeInputValue,
  weekDraft,
  weekHours,
  type WeekDraft,
} from "../src/features/online/state.ts";
import {
  namesSession,
  sessionDetail,
  sessionText,
  sessionTitle,
  type SessionNaming,
} from "../src/lib/session-label.ts";

test("phones keep an optional plus and 6-15 digits, like the server", () => {
  assert.equal(normalizePhone(" +39 333 123 4567 "), "+393331234567");
  assert.equal(normalizePhone("0212345678"), "0212345678");
  assert.equal(normalizePhone("+123456789012345"), "+123456789012345");
  for (const invalid of [
    "12345",
    "+1234567890123456",
    "+39-333-1234567",
    "++39333",
    "39+333123",
    "",
  ])
    assert.equal(normalizePhone(invalid), null, invalid);
});

test("time inputs map 00:00 as a closing time to midnight at the end of the day", () => {
  assert.equal(parseTime("12:30", false), 750);
  assert.equal(parseTime("00:00", false), 0);
  assert.equal(parseTime("00:00", true), 1440);
  assert.equal(parseTime("23:59", true), 1439);
  for (const invalid of ["24:00", "7:00", "12:60", "", "noon"])
    assert.equal(parseTime(invalid, true), null, invalid);
  assert.equal(formatMinute(1440), "24:00");
  assert.equal(formatMinute(75), "01:15");
  assert.equal(timeInputValue(1440), "00:00");
  assert.equal(timeInputValue(1080), "18:00");
});

const empty = (): WeekDraft => weekDraft([]);

test("a valid week becomes sorted hours and round-trips through the draft", () => {
  const week = empty();
  week[1] = [
    { opens: "18:00", closes: "00:00" },
    { opens: "12:00", closes: "15:00" },
  ];
  week[7] = [{ opens: "11:00", closes: "14:30" }];
  const result = weekHours(week);
  assert.deepEqual(result, {
    ok: true,
    hours: [
      { weekday: 1, opensMinute: 720, closesMinute: 900 },
      { weekday: 1, opensMinute: 1080, closesMinute: 1440 },
      { weekday: 7, opensMinute: 660, closesMinute: 870 },
    ],
  });
  assert.ok(result.ok);
  const again = weekHours(weekDraft(result.hours));
  assert.ok(again.ok && sameHours(again.hours, result.hours));
  // Adjacent slots are allowed.
  week[2] = [
    { opens: "12:00", closes: "15:00" },
    { opens: "15:00", closes: "16:00" },
  ];
  assert.equal(weekHours(week).ok, true);
});

test("invalid days name the weekday and the problem", () => {
  const cases: [WeekDraft[number], string][] = [
    [[{ opens: "", closes: "15:00" }], "time"],
    [[{ opens: "15:00", closes: "12:00" }], "order"],
    [[{ opens: "12:00", closes: "12:00" }], "order"],
    [
      [
        { opens: "12:00", closes: "15:00" },
        { opens: "14:00", closes: "18:00" },
      ],
      "overlap",
    ],
    [
      [
        { opens: "08:00", closes: "09:00" },
        { opens: "12:00", closes: "15:00" },
        { opens: "18:00", closes: "22:00" },
      ],
      "tooMany",
    ],
  ];
  for (const [slots, problem] of cases) {
    const week = empty();
    week[3] = slots;
    assert.deepEqual(weekHours(week), { ok: false, weekday: 3, problem });
  }
  assert.equal(
    sameHours(
      [{ weekday: 1, opensMinute: 720, closesMinute: 900 }],
      [{ weekday: 1, opensMinute: 720, closesMinute: 901 }],
    ),
    false,
  );
});

test("the banner counts waiting requests and warns once the cap stops new orders", () => {
  assert.equal(pendingBanner(0), null);
  assert.deepEqual(pendingBanner(3), { full: false, count: 3 });
  assert.deepEqual(pendingBanner(MAX_WAITING_REQUESTS), { full: true, count: 20 });
  // The banner can still describe an oversized list, including requests made before the cross-day lock.
  assert.deepEqual(pendingBanner(21), { full: true, count: 21 });
});

test("waiting and remaining time follow the server's clock, not the device's", () => {
  const request = { submittedAt: "2026-11-16T11:00:00Z", expiresAt: "2026-11-16T11:10:00Z" };
  // The device clock runs an hour behind; only the time since the list arrived comes from it.
  const receivedAt = Date.parse("2026-11-16T10:03:00Z");
  assert.deepEqual(requestTimes(request, "2026-11-16T11:03:00Z", receivedAt, receivedAt + 30_500), {
    waitedMinutes: 3,
    remainingSeconds: 390,
  });
  assert.deepEqual(requestTimes(request, "2026-11-16T11:12:00Z", receivedAt, receivedAt), {
    waitedMinutes: 12,
    remainingSeconds: 0,
  });
  assert.equal(formatCountdown(390), "6:30");
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(0), "0:00");
});

test("an accepted order is cooking, ready or entirely cancelled", () => {
  assert.equal(activeProgress({ newItemCount: 1, readyItemCount: 2 }), "preparing");
  assert.equal(activeProgress({ newItemCount: 0, readyItemCount: 1 }), "ready");
  assert.equal(activeProgress({ newItemCount: 0, readyItemCount: 0 }), "cancelled");
});

test("sessions are named by their table or their online ticket in every language", () => {
  const table: SessionNaming = { channel: "DINE_IN", tableLabel: "5", online: null };
  const pickup: SessionNaming = {
    channel: "PICKUP",
    tableLabel: null,
    online: { number: 12, customerName: "Marco", estimatedAt: "2026-11-16T17:25:00Z" },
  };
  assert.equal(sessionTitle(table, "zh"), "5 桌");
  assert.equal(sessionDetail(table, "it"), null);
  assert.equal(sessionText(table, "en"), "Table 5");
  assert.equal(sessionTitle(pickup, "zh"), "自取 #12");
  assert.equal(sessionTitle(pickup, "it"), "Ritiro #12");
  assert.equal(sessionText(pickup, "en"), "Pickup #12 · Marco · 18:25");
  assert.equal(sessionTitle({ ...pickup, channel: "DELIVERY" }, "it"), "Consegna #12");
  // Contact data cleared after 30 days leaves the number and time.
  const cleared = { ...pickup, online: { ...pickup.online!, customerName: null } };
  assert.equal(sessionText(cleared, "zh"), "自取 #12 · 18:25");
  assert.equal(namesSession(table), true);
  assert.equal(namesSession(pickup), true);
  assert.equal(namesSession({ ...table, tableLabel: null }), false);
  assert.equal(namesSession({ ...pickup, online: null }), false);
});
