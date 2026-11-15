import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptFee,
  activeProgress,
  couponInput,
  DELIVERY_MINUTES,
  deliveryDraft,
  deliveryInput,
  deliveryWithoutNote,
  formatCountdown,
  formatMinute,
  mapsUrl,
  MAX_WAITING_REQUESTS,
  normalizeCouponCode,
  normalizePhone,
  pendingBanner,
  PICKUP_MINUTES,
  rejectReasons,
  requestTimes,
  parseTime,
  sameDelivery,
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

test("delivery settings trim notes, store blanks as null and reject notes over 500 characters", () => {
  const saved = {
    deliveryEnabled: false,
    deliveryNoteZh: null,
    deliveryNoteIt: "Entro 5 km gratis",
    deliveryNoteEn: null,
  };
  const draft = deliveryDraft(saved);
  assert.deepEqual(draft, { enabled: false, notes: { zh: "", it: "Entro 5 km gratis", en: "" } });
  const unchanged = deliveryInput(draft);
  assert.ok(unchanged.ok && sameDelivery(unchanged.input, saved));

  const edited = deliveryInput({
    enabled: true,
    notes: { zh: "   ", it: "  Entro 5 km gratis  ", en: ` ${"a".repeat(500)} ` },
  });
  assert.deepEqual(edited, {
    ok: true,
    input: { enabled: true, noteZh: null, noteIt: "Entro 5 km gratis", noteEn: "a".repeat(500) },
  });
  assert.ok(edited.ok && !sameDelivery(edited.input, saved));
  assert.ok(edited.ok && !deliveryWithoutNote(edited.input));

  assert.deepEqual(
    deliveryInput({ enabled: true, notes: { zh: "配".repeat(501), it: "", en: "" } }),
    {
      ok: false,
      tooLong: "zh",
    },
  );
  const bare = deliveryInput({ enabled: true, notes: { zh: " ", it: "", en: "" } });
  assert.ok(bare.ok && deliveryWithoutNote(bare.input));
  const off = deliveryInput({ enabled: false, notes: { zh: "", it: "", en: "" } });
  assert.ok(off.ok && !deliveryWithoutNote(off.input));
});

test("delivery acceptance takes an explicit decimal fee, 0 when free, within the safe total", () => {
  assert.equal(acceptFee("2", 2400), 200);
  assert.equal(acceptFee(" 2,5 ", 2400), 250);
  assert.equal(acceptFee("0", 2400), 0);
  assert.equal(acceptFee("0.00", 2400), 0);
  for (const invalid of ["", " ", "-1", "2.555", "abc", "2 €"])
    assert.equal(acceptFee(invalid, 2400), null, invalid);
  const max = Number.MAX_SAFE_INTEGER;
  assert.equal(acceptFee("0.01", max - 1), 1);
  assert.equal(acceptFee("0.02", max - 1), null);
});

test("delivery has its own times and the out-of-range reason", () => {
  assert.deepEqual([...PICKUP_MINUTES], [10, 20, 30, 45]);
  assert.deepEqual([...DELIVERY_MINUTES], [30, 45, 60, 90]);
  assert.deepEqual(rejectReasons("PICKUP"), ["SOLD_OUT", "BUSY", "CLOSING"]);
  assert.deepEqual(rejectReasons("DELIVERY"), ["SOLD_OUT", "BUSY", "CLOSING", "OUT_OF_RANGE"]);
});

test("a delivery address opens a plain maps search with the address encoded", () => {
  assert.equal(
    mapsUrl("Via Roma 1, Milano & co"),
    "https://www.google.com/maps/search/?api=1&query=Via%20Roma%201%2C%20Milano%20%26%20co",
  );
});

test("coupon codes are trimmed and uppercased like the server, 3-20 letters or digits", () => {
  assert.equal(normalizeCouponCode("  estate10 "), "ESTATE10");
  assert.equal(normalizeCouponCode("abc"), "ABC");
  assert.equal(normalizeCouponCode("A".repeat(20)), "A".repeat(20));
  for (const invalid of ["AB", "A".repeat(21), "ESTATE-10", "ESTATE 10", "", "ÉTÉ10"])
    assert.equal(normalizeCouponCode(invalid), null);
});

test("the coupon form sends a whole percentage of 1-50 and an optional last day", () => {
  assert.deepEqual(couponInput({ code: " estate10", percent: "10", validUntil: "" }), {
    ok: true,
    input: { code: "ESTATE10", percentOff: 10, validUntil: null },
  });
  assert.deepEqual(couponInput({ code: "ESTATE", percent: " 50 ", validUntil: "2026-12-31" }), {
    ok: true,
    input: { code: "ESTATE", percentOff: 50, validUntil: "2026-12-31" },
  });
  for (const percent of ["0", "51", "", "10.5", "1e1", "-5", "abc"])
    assert.deepEqual(couponInput({ code: "ESTATE", percent, validUntil: "" }), {
      ok: false,
      problems: ["percent"],
    });
  assert.deepEqual(couponInput({ code: "x", percent: "0", validUntil: "" }), {
    ok: false,
    problems: ["code", "percent"],
  });
});
