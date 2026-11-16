import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  verificationBinding,
  verificationContext,
  verificationToken,
} from "../src/features/online-order/verification.ts";

const restaurant = "00000000-0000-4000-8000-000000000010";
const request = "00000000-0000-4000-8000-000000000011";

test("verification binds restaurant and request using the backend's canonical SHA-256 format", () => {
  const binding = verificationBinding(restaurant, request);
  assert.equal(
    binding,
    createHash("sha256")
      .update("00000000000040008000000000000010:00000000000040008000000000000011")
      .digest("hex"),
  );
  assert.equal(verificationBinding(restaurant.toUpperCase(), request.toUpperCase()), binding);
  assert.notEqual(verificationBinding(request, restaurant), binding);
  assert.doesNotMatch(binding, new RegExp(request.replaceAll("-", "")));
  assert.throws(() => verificationBinding("invalid", request));
});

test("a proof for an old request, key or language cannot authorize the current submit", () => {
  const context = verificationContext("key", verificationBinding(restaurant, request), "it");
  const proof = { token: "proof", context };
  assert.equal(verificationToken(proof, context), "proof");
  for (const current of [
    context + "new-request",
    verificationContext("new-key", verificationBinding(restaurant, request), "it"),
    verificationContext("key", verificationBinding(restaurant, request), "en"),
  ]) {
    assert.equal(verificationToken(proof, current), null);
  }
  assert.equal(verificationToken(null, context), null);
  assert.equal(verificationToken({ token: "", context }, context), null);
  assert.equal(verificationToken({ token: "x".repeat(2049), context }, context), null);
});
