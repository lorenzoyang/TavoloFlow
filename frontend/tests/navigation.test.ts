import assert from "node:assert/strict";
import { test } from "node:test";
import {
  staffManagementRoutes,
  staffNavRoutes,
  type NavAccount,
} from "../src/features/accounts/state.ts";

const account = (role: NavAccount["role"], dineIn: boolean, online: boolean): NavAccount => ({
  role,
  services: { dineIn, online },
});

const ownerExtras = ["/staff/pass", "/staff/history", "/staff/settings", "/staff/subscription"];

test("dine-in restaurants keep today's tabs and home entries", () => {
  assert.deepEqual(staffNavRoutes(account("OWNER", true, false)), [
    "/staff",
    "/staff/floor",
    "/staff/kitchen",
    "/staff/orders",
    "/staff/menu",
  ]);
  assert.deepEqual(staffNavRoutes(account("STAFF", true, false)), [
    "/staff",
    "/staff/floor",
    "/staff/kitchen",
    "/staff/pass",
    "/staff/menu",
  ]);
  assert.deepEqual(staffManagementRoutes(account("STAFF", true, false)), ["/staff/tables"]);
  assert.deepEqual(staffManagementRoutes(account("OWNER", true, false)), [
    "/staff/tables",
    ...ownerExtras,
  ]);
});

test("with dine-in and online ordering, Online takes the last tab and the menu moves home", () => {
  assert.deepEqual(staffNavRoutes(account("OWNER", true, true)), [
    "/staff",
    "/staff/floor",
    "/staff/kitchen",
    "/staff/orders",
    "/staff/online",
  ]);
  assert.deepEqual(staffNavRoutes(account("STAFF", true, true)), [
    "/staff",
    "/staff/floor",
    "/staff/kitchen",
    "/staff/pass",
    "/staff/online",
  ]);
  assert.deepEqual(staffManagementRoutes(account("STAFF", true, true)), [
    "/staff/menu",
    "/staff/tables",
    "/staff/online-settings",
  ]);
  assert.deepEqual(staffManagementRoutes(account("OWNER", true, true)), [
    "/staff/menu",
    "/staff/tables",
    "/staff/online-settings",
    ...ownerExtras,
  ]);
});

test("online-only restaurants have room for both the menu and Online, last", () => {
  assert.deepEqual(staffNavRoutes(account("OWNER", false, true)), [
    "/staff",
    "/staff/kitchen",
    "/staff/orders",
    "/staff/menu",
    "/staff/online",
  ]);
  assert.deepEqual(staffNavRoutes(account("STAFF", false, true)), [
    "/staff",
    "/staff/kitchen",
    "/staff/pass",
    "/staff/menu",
    "/staff/online",
  ]);
  assert.deepEqual(staffManagementRoutes(account("STAFF", false, true)), [
    "/staff/online-settings",
  ]);
  assert.deepEqual(staffManagementRoutes(account("OWNER", false, true)), [
    "/staff/online-settings",
    ...ownerExtras,
  ]);
});

test("no combination shows more than five tabs or lists a tab again on the home page", () => {
  for (const role of ["OWNER", "STAFF"] as const)
    for (const [dineIn, online] of [
      [true, false],
      [true, true],
      [false, true],
    ]) {
      const tabs = staffNavRoutes(account(role, dineIn, online));
      assert.ok(tabs.length <= 5);
      for (const entry of staffManagementRoutes(account(role, dineIn, online)))
        assert.ok(!tabs.includes(entry), `${entry} is both a tab and a home entry`);
    }
});
