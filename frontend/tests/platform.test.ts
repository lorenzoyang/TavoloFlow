import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateQuery, isPlatformQuery } from "../src/lib/query-scope.ts";
import {
  accountRecoveryMessage,
  managementKey,
  readPending,
  recoveryUrl,
  type ManagedAccount,
} from "../src/features/platform/state.ts";
import { randomUuid } from "../src/lib/ids.ts";

test("store and platform invalidation preserve the other identities", () => {
  for (const queryKey of [
    ["platform", "restaurants", "admin"],
    ["platform", "me"],
    ["guest", "restaurant"],
    ["public", "qr"],
    ["auth", "me"],
  ])
    assert.equal(isPrivateQuery({ queryKey }), false);
  assert.equal(isPrivateQuery({ queryKey: ["staff-account", "restaurant", "owner"] }), true);
  assert.equal(isPlatformQuery({ queryKey: ["platform", "restaurant", "admin"] }), true);
  for (const queryKey of [["platform", "me"], ["menu", "restaurant"], ["guest"], ["public"]])
    assert.equal(isPlatformQuery({ queryKey }), false);
});

test("pending management state stores only identifiers and a version, never temporary passwords", () => {
  const restaurantId = randomUuid(),
    userId = randomUuid();
  const pending = readPending(
    JSON.stringify({
      kind: "reset",
      restaurantId,
      userId,
      expectedVersion: 3,
      temporaryPassword: "must-not-survive",
      credentials: [{ temporaryPassword: "secret" }],
    }),
  )!;
  assert.deepEqual(pending, { kind: "reset", restaurantId, userId, expectedVersion: 3 });
  for (const kind of ["maps", "joinCode", "theme"])
    assert.deepEqual(readPending(JSON.stringify({ kind, restaurantId })), {
      kind,
      restaurantId,
      userId: undefined,
      expectedVersion: undefined,
    });
  assert.equal(recoveryUrl("platform", pending), `/api/platform/restaurants/${restaurantId}`);
  assert.equal(recoveryUrl("store", pending), "/api/owner/staff");
  assert.notEqual(managementKey("platform", "admin"), managementKey("store", "admin"));
  assert.notEqual(managementKey("platform", "a"), managementKey("platform", "b"));
});

test("damaged pending records cannot release an uncertain operation", () => {
  assert.equal(readPending(null), null);
  for (const raw of [
    "{",
    "{}",
    JSON.stringify({ kind: "reset", restaurantId: randomUuid() }),
    JSON.stringify({ kind: "create", restaurantId: "../../auth/logout" }),
  ])
    assert.throws(() => readPending(raw));
});

test("recovery compares target versions without treating another administrator's write as our success", () => {
  const account: ManagedAccount = {
    id: randomUuid(),
    username: "staff",
    role: "STAFF",
    isActive: true,
    mustChangePassword: true,
    credentialVersion: 2,
  };
  const pending = {
    kind: "reset" as const,
    restaurantId: randomUuid(),
    userId: account.id,
    expectedVersion: 2,
  };
  assert.match(accountRecoveryMessage(pending, account), /原请求仍可能到达/);
  assert.match(accountRecoveryMessage(pending, { ...account, credentialVersion: 3 }), /其他管理员/);
  assert.throws(() => accountRecoveryMessage(pending, { ...account, id: randomUuid() }));
  assert.throws(() => accountRecoveryMessage(pending, undefined));
});
