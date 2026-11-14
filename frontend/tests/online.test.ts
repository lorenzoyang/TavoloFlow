import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatMinute,
  normalizePhone,
  parseTime,
  sameHours,
  timeInputValue,
  weekDraft,
  weekHours,
  type WeekDraft,
} from "../src/features/online/state.ts";

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
