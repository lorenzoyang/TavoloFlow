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

test("dine-in restaurants keep today's tabs and home entries", () => {
  for (const online of [false, true]) {
    assert.deepEqual(staffNavRoutes(account("OWNER", true, online)), [
      "/staff",
      "/staff/floor",
      "/staff/kitchen",
      "/staff/orders",
      "/staff/menu",
    ]);
    assert.deepEqual(staffNavRoutes(account("STAFF", true, online)), [
      "/staff",
      "/staff/floor",
      "/staff/kitchen",
      "/staff/pass",
      "/staff/menu",
    ]);
    assert.deepEqual(staffManagementRoutes(account("STAFF", true, online)), ["/staff/tables"]);
    assert.deepEqual(staffManagementRoutes(account("OWNER", true, online)), [
      "/staff/tables",
      "/staff/pass",
      "/staff/history",
      "/staff/settings",
      "/staff/subscription",
    ]);
  }
});

test("online-only restaurants have no floor or tables, and the other tabs keep their order", () => {
  assert.deepEqual(staffNavRoutes(account("OWNER", false, true)), [
    "/staff",
    "/staff/kitchen",
    "/staff/orders",
    "/staff/menu",
  ]);
  assert.deepEqual(staffNavRoutes(account("STAFF", false, true)), [
    "/staff",
    "/staff/kitchen",
    "/staff/pass",
    "/staff/menu",
  ]);
  assert.deepEqual(staffManagementRoutes(account("STAFF", false, true)), []);
  assert.deepEqual(staffManagementRoutes(account("OWNER", false, true)), [
    "/staff/pass",
    "/staff/history",
    "/staff/settings",
    "/staff/subscription",
  ]);
});
