import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCents, formatMoney, parsePrice } from "../src/lib/format.ts";
import { isUuid, randomUuid } from "../src/lib/ids.ts";
import { isLanguage } from "../src/lib/language.ts";

test("UUIDs need only getRandomValues and carry the UUIDv4 version and variant bits", () => {
  const cryptoWithoutRandomUuid = { getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    (array as Uint8Array).fill(255); return array;
  } };
  assert.equal(randomUuid(cryptoWithoutRandomUuid), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  const ids = Array.from({ length: 100 }, () => randomUuid());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(ids.every(isUuid));
  for (const value of [null, 42, "", "not-a-uuid", "../../auth/logout"]) assert.equal(isUuid(value), false);
});

test("prices parse decimal text into exact integer cents and reject unsafe or ambiguous input", () => {
  assert.equal(parsePrice("12.5"), 1250);
  assert.equal(parsePrice(" 12,50 "), 1250);
  assert.equal(parsePrice("0.01"), 1);
  assert.equal(parsePrice("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  for (const value of ["0", "0.00", "1.234", "-1", "1e3", "", "90071992547409.92"]) assert.equal(parsePrice(value), null);
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
