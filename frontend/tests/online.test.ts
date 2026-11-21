import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeProgress,
  applyFreeDeliveryMinimum,
  couponInput,
  DELIVERY_MINUTES,
  deliveryDraft,
  deliveryInput,
  deliveryTierRanges,
  freeDeliveryChanges,
  emptyTierDraft,
  formatCountdown,
  formatMinute,
  mapsUrl,
  MAX_DELIVERY_TIERS,
  originMapsUrl,
  parseOrigin,
  routeUrl,
  MAX_WAITING_REQUESTS,
  normalizeCouponCode,
  normalizePhone,
  pendingBanner,
  PICKUP_MINUTES,
  rejectReasons,
  requestTimes,
  parseTime,
  sameDelivery,
  copyDay,
  sameHours,
  timeInputValue,
  typedDeliveryFee,
  weekDraft,
  weekHours,
  type TierDraft,
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

test("copying a day replaces the chosen days' slots with independent copies", () => {
  const week = empty();
  week[2] = [
    { opens: "12:00", closes: "15:00" },
    { opens: "19:00", closes: "00:00" },
  ];
  week[3] = [{ opens: "11:00", closes: "14:00" }];
  const copied = copyDay(week, 2, [2, 3, 4]);
  assert.deepEqual(copied[3], week[2]);
  assert.deepEqual(copied[4], week[2]);
  // The source day, the days not chosen and the original draft stay as they were.
  assert.equal(copied[2], week[2]);
  assert.deepEqual(copied[1], []);
  assert.deepEqual(week[3], [{ opens: "11:00", closes: "14:00" }]);
  // Editing a copy never edits the source.
  copied[3][0].opens = "10:00";
  assert.equal(week[2][0].opens, "12:00");
  // Copying a closed day closes the chosen days.
  assert.deepEqual(copyDay(week, 1, [3])[3], []);
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
  assert.equal(sessionText(pickup, "en"), "Pickup #12 · Marco · Expected 18:25");
  assert.equal(sessionTitle({ ...pickup, channel: "DELIVERY" }, "it"), "Consegna #12");
  const scheduled: SessionNaming = {
    ...pickup,
    online: { ...pickup.online!, requestedPickupAt: "2026-11-22T11:00:00Z" },
  };
  assert.match(
    sessionDetail(scheduled, "en")?.time ?? "",
    /^Scheduled pickup · Sun,? 22 Nov,? 12:00$/,
  );
  assert.match(sessionDetail(scheduled, "it")?.time ?? "", /^Ritiro programmato · .*12:00$/);
  assert.match(sessionDetail(scheduled, "zh")?.time ?? "", /^预约取餐 · .*12:00$/);
  // Contact data cleared after 30 days leaves the number and the estimated time.
  const cleared = { ...pickup, online: { ...pickup.online!, customerName: null } };
  assert.equal(sessionText(cleared, "zh"), "自取 #12 · 预计 18:25");
  assert.equal(namesSession(table), true);
  assert.equal(namesSession(pickup), true);
  assert.equal(namesSession({ ...table, tableLabel: null }), false);
  assert.equal(namesSession({ ...pickup, online: null }), false);
});

const noDelivery = {
  deliveryEnabled: false,
  deliveryNoteZh: null,
  deliveryNoteIt: null,
  deliveryNoteEn: null,
  deliveryMinOrderCents: null,
  deliveryOriginLat: null,
  deliveryOriginLng: null,
  deliveryTiers: [],
  deliveryAutoQuote: false,
};
const noNotes = { zh: "", it: "", en: "" };
const blankDraft = { origin: "", tiers: [], minOrder: "", notes: noNotes, enabled: false };

test("delivery settings trim notes, store blanks as null and reject notes over 500 characters", () => {
  const saved = { ...noDelivery, deliveryNoteIt: "Solo Prato centro" };
  const draft = deliveryDraft(saved);
  assert.deepEqual(draft, { ...blankDraft, notes: { zh: "", it: "Solo Prato centro", en: "" } });
  const unchanged = deliveryInput(draft);
  assert.ok(unchanged.ok && sameDelivery(unchanged.input, saved));

  const edited = deliveryInput({
    ...blankDraft,
    notes: { zh: "   ", it: "  Solo Prato centro  ", en: ` ${"a".repeat(500)} ` },
  });
  assert.deepEqual(edited, {
    ok: true,
    input: {
      enabled: false,
      noteZh: null,
      noteIt: "Solo Prato centro",
      noteEn: "a".repeat(500),
      minOrderCents: null,
      originLat: null,
      originLng: null,
      tiers: [],
    },
  });
  assert.ok(edited.ok && !sameDelivery(edited.input, saved));

  assert.deepEqual(
    deliveryInput({ ...blankDraft, notes: { zh: "配".repeat(501), it: "", en: "" } }),
    { ok: false, problem: { field: "note", language: "zh" } },
  );
});

test("the delivery minimum is a positive decimal amount, blank for none", () => {
  const saved = { ...noDelivery, deliveryMinOrderCents: 1550 };
  assert.equal(deliveryDraft(saved).minOrder, "15.50");
  const same = deliveryInput(deliveryDraft(saved));
  assert.ok(same.ok && sameDelivery(same.input, saved));
  for (const [text, cents] of [
    ["15", 1500],
    [" 15,5 ", 1550],
    ["0.01", 1],
    ["  ", null],
  ] as const) {
    const parsed = deliveryInput({ ...blankDraft, minOrder: text });
    assert.ok(parsed.ok, text);
    assert.equal(parsed.input.minOrderCents, cents, text);
  }
  for (const text of ["0", "0.00", "-5", "15.555", "15 €"])
    assert.deepEqual(
      deliveryInput({ ...blankDraft, minOrder: text }),
      { ok: false, problem: { field: "minOrder" } },
      text,
    );
});

test("coordinates are pasted as Google Maps copies them, latitude first, rounded to six decimals", () => {
  assert.deepEqual(parseOrigin("43.88015, 11.09612"), { lat: 43.88015, lng: 11.09612 });
  assert.deepEqual(parseOrigin(" 43.8801534 ,11.0961216 "), { lat: 43.880153, lng: 11.096122 });
  assert.deepEqual(parseOrigin("-33.8688, 151.2093"), { lat: -33.8688, lng: 151.2093 });
  // Google's own example of the format it uses.
  assert.deepEqual(parseOrigin("41.40338, 2.17403"), { lat: 41.40338, lng: 2.17403 });
  for (const value of [
    "",
    "43.88015",
    "43,88015, 11,09612",
    "41,40338, 2,17403",
    "91, 11",
    "43.88, 181",
    "https://maps.app.goo.gl/abc123",
    "@43.88015,11.09612,17z",
  ])
    assert.equal(parseOrigin(value), null, value);
  assert.equal(
    originMapsUrl({ lat: 43.88015, lng: 11.09612 }),
    "https://www.google.com/maps/search/?api=1&query=43.88015,11.09612",
  );
  assert.equal(
    routeUrl({ lat: 43.88015, lng: 11.09612 }, "Via Roma 1, Prato"),
    "https://www.google.com/maps/dir/?api=1&origin=43.88015,11.09612&destination=Via%20Roma%201%2C%20Prato&travelmode=driving",
  );
});

test("fee bands take kilometres and a fee, save nearest first and round-trip unchanged", () => {
  const saved = {
    ...noDelivery,
    deliveryEnabled: true,
    deliveryOriginLat: 43.88015,
    deliveryOriginLng: 11.09612,
    deliveryTiers: [
      { maxMeters: 2500, feeCents: 0, freeDeliveryMinCents: null },
      { maxMeters: 6000, feeCents: 400, freeDeliveryMinCents: 3000 },
    ],
  };
  const draft = deliveryDraft(saved);
  assert.deepEqual(draft, {
    ...blankDraft,
    enabled: true,
    origin: "43.88015, 11.09612",
    tiers: [
      { km: "2.5", fee: "0.00", freeDeliveryMinCents: null },
      { km: "6", fee: "4.00", freeDeliveryMinCents: 3000 },
    ],
  });
  const same = deliveryInput(draft);
  assert.ok(same.ok && sameDelivery(same.input, saved));

  // Typed in any order with a decimal comma; saved nearest first.
  const typed = deliveryInput({
    ...draft,
    tiers: [
      { ...emptyTierDraft, km: "10", fee: "6" },
      { ...emptyTierDraft, km: "0,5", fee: "0" },
      { ...emptyTierDraft, km: "30", fee: "12,50" },
    ],
  });
  assert.ok(typed.ok);
  assert.deepEqual(typed.input.tiers, [
    { maxMeters: 500, feeCents: 0, freeDeliveryMinCents: null },
    { maxMeters: 10_000, feeCents: 600, freeDeliveryMinCents: null },
    { maxMeters: 30_000, feeCents: 1250, freeDeliveryMinCents: null },
  ]);
  assert.ok(!sameDelivery(typed.input, saved));

  for (const [tiers, problem] of [
    [[{ km: "0", fee: "2" }], { field: "tier", index: 0, part: "km" }],
    [[{ km: "30.1", fee: "2" }], { field: "tier", index: 0, part: "km" }],
    [[{ km: "2.55", fee: "2" }], { field: "tier", index: 0, part: "km" }],
    [[{ km: "3", fee: "" }], { field: "tier", index: 0, part: "fee" }],
    [[{ km: "3", fee: "-1" }], { field: "tier", index: 0, part: "fee" }],
    [
      [
        { km: "3", fee: "2" },
        { km: "3,0", fee: "4" },
      ],
      { field: "tier", index: 1, part: "repeated" },
    ],
  ] as const)
    assert.deepEqual(
      deliveryInput({ ...draft, tiers: tiers.map((tier) => ({ ...emptyTierDraft, ...tier })) }),
      { ok: false, problem },
    );
  assert.deepEqual(deliveryInput({ ...draft, origin: "Via Roma 1" }), {
    ok: false,
    problem: { field: "origin" },
  });
  assert.equal(MAX_DELIVERY_TIERS, 5);
});

test("free delivery applies one threshold to selected bands, and editing can move or clear it", () => {
  const tiers = ["6", "2", "4"].map((km) => ({ ...emptyTierDraft, km, fee: "4" }));
  assert.deepEqual(deliveryTierRanges(tiers), [
    { index: 1, minMeters: 0, maxMeters: 2000 },
    { index: 2, minMeters: 2000, maxMeters: 4000 },
    { index: 0, minMeters: 4000, maxMeters: 6000 },
  ]);
  const amounts = (rows: typeof tiers) => rows.map((tier) => tier.freeDeliveryMinCents);
  const withNear = applyFreeDeliveryMinimum(tiers, null, [1, 2], 2500);
  const withFar = applyFreeDeliveryMinimum(withNear, null, [0], 3000);
  assert.deepEqual(amounts(withFar), [3000, 2500, 2500]);
  const replaced = applyFreeDeliveryMinimum(withFar, 2500, [0, 1], 2800);
  assert.deepEqual(amounts(replaced), [2800, 2800, null]);
  assert.deepEqual(amounts(applyFreeDeliveryMinimum(replaced, 2800, [], null)), [null, null, null]);
});

test("free delivery marks changed groups and reports clearing a threshold on a retained band", () => {
  const saved = [
    { maxMeters: 2000, feeCents: 200, freeDeliveryMinCents: 2500 },
    { maxMeters: 4000, feeCents: 300, freeDeliveryMinCents: 2500 },
    { maxMeters: 6000, feeCents: 450, freeDeliveryMinCents: 3000 },
  ];
  const draft = [
    { km: "6", fee: "4.50", freeDeliveryMinCents: 3000 },
    { km: "2,0", fee: "2.00", freeDeliveryMinCents: 2500 },
    { km: "4", fee: "3.00", freeDeliveryMinCents: 2500 },
  ];
  const changes = (tiers: TierDraft[]) => freeDeliveryChanges(tiers, saved);
  assert.deepEqual(changes(draft), { amounts: new Set(), restoresBaseFee: false });
  assert.deepEqual(changes(applyFreeDeliveryMinimum(draft, 2500, [1, 2], 2800)), {
    amounts: new Set([2500, 2800]),
    restoresBaseFee: false,
  });
  assert.deepEqual(changes(applyFreeDeliveryMinimum(draft, 2500, [1], 2500)), {
    amounts: new Set([2500]),
    restoresBaseFee: true,
  });
  assert.deepEqual(changes(applyFreeDeliveryMinimum(draft, 2500, [], null)), {
    amounts: new Set([2500]),
    restoresBaseFee: true,
  });
  assert.deepEqual(changes(draft.slice(0, 1)), {
    amounts: new Set([2500]),
    restoresBaseFee: false,
  });
});

test("delivery turns on only with the coordinates and a band, and off keeps both", () => {
  const tiers = [{ ...emptyTierDraft, km: "3", fee: "2" }];
  const origin = "43.88015, 11.09612";
  for (const draft of [
    { ...blankDraft, enabled: true, tiers },
    { ...blankDraft, enabled: true, origin },
  ])
    assert.deepEqual(deliveryInput(draft), { ok: false, problem: { field: "setup" } });
  assert.ok(deliveryInput({ ...blankDraft, enabled: true, origin, tiers }).ok);
  const off = deliveryInput({ ...blankDraft, origin, tiers });
  assert.ok(off.ok);
  assert.deepEqual(
    [off.input.originLat, off.input.originLng, off.input.tiers],
    [43.88015, 11.09612, [{ maxMeters: 3000, feeCents: 200, freeDeliveryMinCents: null }]],
  );
});

test("a typed delivery fee is a decimal amount, 0 when free, within the safe total", () => {
  assert.equal(typedDeliveryFee("2", 2400), 200);
  assert.equal(typedDeliveryFee(" 2,5 ", 2400), 250);
  assert.equal(typedDeliveryFee("0", 2400), 0);
  assert.equal(typedDeliveryFee("0.00", 2400), 0);
  for (const invalid of ["", " ", "-1", "2.555", "abc", "2 €"])
    assert.equal(typedDeliveryFee(invalid, 2400), null, invalid);
  const max = Number.MAX_SAFE_INTEGER;
  assert.equal(typedDeliveryFee("0.01", max - 1), 1);
  assert.equal(typedDeliveryFee("0.02", max - 1), null);
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

test("an incomplete date cannot create a coupon with no expiry; clearing or completing it can", () => {
  const draft = { code: "ESTATE", percent: "15", validUntil: "" };
  // Native date inputs expose the same empty value for a partial date and an intentional blank.
  assert.deepEqual(couponInput(draft, true), { ok: false, problems: ["date"] });
  assert.deepEqual(couponInput(draft, false), {
    ok: true,
    input: { code: "ESTATE", percentOff: 15, validUntil: null },
  });
  assert.deepEqual(couponInput({ ...draft, validUntil: "2026-12-31" }, false), {
    ok: true,
    input: { code: "ESTATE", percentOff: 15, validUntil: "2026-12-31" },
  });
  assert.deepEqual(couponInput({ ...draft, code: "x", percent: "0" }, true), {
    ok: false,
    problems: ["code", "percent", "date"],
  });
});
