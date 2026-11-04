import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCents,
  formatDateTime,
  formatMoney,
  formatTime,
  parsePrice,
  shortId,
} from "../src/lib/format.ts";
import { isUuid, randomUuid } from "../src/lib/ids.ts";
import { isLanguage } from "../src/lib/language.ts";
import {
  browserLanguage,
  readStaffLanguage,
  saveStaffLanguage,
  staffLanguageKey,
} from "../src/lib/staff-language.ts";

test("UUIDs need only getRandomValues and carry the UUIDv4 version and variant bits", () => {
  const cryptoWithoutRandomUuid = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      (array as Uint8Array).fill(255);
      return array;
    },
  };
  assert.equal(randomUuid(cryptoWithoutRandomUuid), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  const ids = Array.from({ length: 100 }, () => randomUuid());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(ids.every(isUuid));
  for (const value of [null, 42, "", "not-a-uuid", "../../auth/logout"])
    assert.equal(isUuid(value), false);
});

test("prices parse decimal text into exact integer cents and reject unsafe or ambiguous input", () => {
  assert.equal(parsePrice("12.5"), 1250);
  assert.equal(parsePrice(" 12,50 "), 1250);
  assert.equal(parsePrice("0.01"), 1);
  assert.equal(parsePrice("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  for (const value of ["0", "0.00", "1.234", "-1", "1e3", "", "90071992547409.92"])
    assert.equal(parsePrice(value), null);
});

test("amounts that may be waived admit zero but keep every other price rule", () => {
  assert.equal(parsePrice("0", true), 0);
  assert.equal(parsePrice("0,00", true), 0);
  assert.equal(parsePrice("500,50", true), 50050);
  for (const value of ["-1", "1.234", "", "90071992547409.92"])
    assert.equal(parsePrice(value, true), null);
});

test("cents format without floating-point rounding; Italian uses a decimal comma", () => {
  assert.equal(formatCents(1250), "12.50");
  assert.equal(formatCents(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  assert.equal(formatMoney(705), "€ 7.05");
  assert.equal(formatMoney(705, "it"), "€ 7,05");
  assert.equal(formatMoney(705, "en"), "€ 7.05");
});

test("only the three supported languages are accepted", () => {
  for (const value of ["zh", "it", "en"]) assert.equal(isLanguage(value), true);
  for (const value of ["ZH", "fr", "", null]) assert.equal(isLanguage(value), false);
});

test("compact times use the restaurant clock in 24-hour form", () => {
  // 17:05 UTC is 19:05 in Rome during summer time and 18:05 in winter.
  assert.equal(formatTime("2026-07-01T17:05:00Z"), "19:05");
  assert.equal(formatTime("2026-12-01T17:05:00Z", "it"), "18:05");
  assert.equal(formatTime("2026-12-01T17:05:00Z", "en"), "18:05");
});

test("short references come from the random tail, so records created together stay distinct", () => {
  // Two UUIDv7 values from the same millisecond share their timestamp head.
  const first = "019a1b2c-3d4e-7f00-8a1b-0c2d3e4f5a6b";
  const second = "019a1b2c-3d4e-7f00-9c8d-7e6f5a4b3c2d";
  assert.equal(shortId(first), "4F5A6B");
  assert.equal(shortId(second), "4B3C2D");
});

test("without a stored choice, the interface follows the first supported browser language", () => {
  assert.equal(browserLanguage(["zh-TW", "en-US"]), "zh");
  assert.equal(browserLanguage(["de-DE", "IT-it", "en"]), "it");
  assert.equal(browserLanguage(["en-GB"]), "en");
  assert.equal(browserLanguage(["fr-FR", "de"]), "en");
  assert.equal(browserLanguage([]), "en");
});

test("the interface language is a device choice that wins over the browser", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(readStaffLanguage(storage, ["it-IT"]), "it");
  assert.equal(readStaffLanguage(storage), "en");
  for (const language of ["zh", "it", "en"] as const) {
    saveStaffLanguage(language, storage);
    assert.equal(values.get(staffLanguageKey), language);
    assert.equal(readStaffLanguage(storage, ["it-IT"]), language);
  }
  for (const value of ["fr", "malformed", ""]) {
    values.set(staffLanguageKey, value);
    assert.equal(readStaffLanguage(storage, ["zh-CN"]), "zh");
  }
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readStaffLanguage(blocked, ["zh-CN"]), "zh");
  assert.equal(readStaffLanguage(null, ["it"]), "it");
  assert.doesNotThrow(() => saveStaffLanguage("it", blocked));
});

test("dates follow the interface language; English uses the European day/month order", () => {
  const value = "2026-11-04T17:05:00Z";
  assert.equal(formatDateTime(value, "en"), "04/11/2026, 18:05:00");
  assert.equal(formatDateTime(value, "zh"), "2026/11/4 18:05:00");
});
