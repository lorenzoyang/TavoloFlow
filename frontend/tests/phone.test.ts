import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPhone } from "../src/lib/phone.ts";

test("phone display groups long numbers and preserves their digits, zeros and plus sign", () => {
  assert.equal(formatPhone("+390012345678"), "+39 001 234 5678");
  assert.equal(formatPhone("+14155552671"), "+1 415 555 2671");
  assert.equal(formatPhone("02123456"), "0 212 3456");
  assert.equal(formatPhone("+123456789012345"), "+12 345 678 901 2345");
});

test("phone display keeps short numbers and unrecognized input as received", () => {
  assert.equal(formatPhone("1234567"), "1234567");
  assert.equal(formatPhone("+39 001 234 5678"), "+39 001 234 5678");
});
