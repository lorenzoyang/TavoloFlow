import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateQuery, isPlatformQuery, isStoreMutation } from "../src/lib/query-scope.ts";
import { accountRecoveryMessage, managementKey, readPending, recoveryUrl, newRestaurantId, type ManagedAccount } from "../src/features/platform/state.ts";

test("store and platform invalidation preserve the other identities", () => {
  for (const queryKey of [["platform", "restaurants", "admin"], ["platform", "me"], ["guest", "restaurant"], ["public", "qr"]])
    assert.equal(isPrivateQuery({ queryKey }), false);
  assert.equal(isPrivateQuery({ queryKey: ["staff-account", "restaurant", "owner"] }), true);
  assert.equal(isPlatformQuery({ queryKey: ["platform", "restaurant", "admin"] }), true);
  for (const queryKey of [["platform", "me"], ["menu", "restaurant"], ["guest"], ["public"]]) assert.equal(isPlatformQuery({ queryKey }), false);
  assert.equal(isStoreMutation({ identityScope: "platform" }), false);
  assert.equal(isStoreMutation({ identityScope: "guest" }), false);
  assert.equal(isStoreMutation(undefined), true);
});

test("pending management state stores only identifiers and a version, never temporary passwords", () => {
  const restaurantId = newRestaurantId(), userId = newRestaurantId();
  const pending = readPending(JSON.stringify({ kind: "reset", restaurantId, userId, expectedVersion: 3,
    temporaryPassword: "must-not-survive", credentials: [{ temporaryPassword: "secret" }] }))!;
  assert.deepEqual(pending, { kind: "reset", restaurantId, userId, expectedVersion: 3 });
  assert.equal(recoveryUrl("platform", pending), `/api/platform/restaurants/${restaurantId}`);
  assert.equal(recoveryUrl("store", pending), "/api/owner/staff");
  assert.notEqual(managementKey("platform", "admin"), managementKey("store", "admin"));
  assert.notEqual(managementKey("platform", "a"), managementKey("platform", "b"));
});

test("damaged pending records cannot release an uncertain operation", () => {
  assert.equal(readPending(null), null);
  for (const raw of ["{", "{}", JSON.stringify({ kind: "reset", restaurantId: newRestaurantId() }),
    JSON.stringify({ kind: "create", restaurantId: "../../auth/logout" })]) assert.throws(() => readPending(raw));
});

test("creation identifiers work with secure random bytes without HTTPS randomUUID", () => {
  const ids = Array.from({ length: 100 }, newRestaurantId);
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("recovery compares target versions without treating another administrator's write as our success", () => {
  const account: ManagedAccount = { id: newRestaurantId(), username: "staff", role: "STAFF", isActive: true,
    mustChangePassword: true, credentialVersion: 2 };
  const pending = { kind: "reset" as const, restaurantId: newRestaurantId(), userId: account.id, expectedVersion: 2 };
  assert.match(accountRecoveryMessage(pending, account), /原请求仍可能到达/);
  assert.match(accountRecoveryMessage(pending, { ...account, credentialVersion: 3 }), /其他管理员/);
  assert.throws(() => accountRecoveryMessage(pending, { ...account, id: newRestaurantId() }));
  assert.throws(() => accountRecoveryMessage(pending, undefined));
});
