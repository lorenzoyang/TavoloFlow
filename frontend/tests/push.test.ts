import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeKey,
  isOrderNotification,
  pushStatus,
  pushSupport,
  sameKey,
  subscriptionBody,
  type PushEnvironment,
} from "../src/features/push/state.ts";

const capable: PushEnvironment = {
  serviceWorker: true,
  pushManager: true,
  notification: true,
  secureContext: true,
  appleMobile: false,
  standalone: false,
};

test("push needs a secure page with the worker, PushManager and notifications", () => {
  assert.equal(pushSupport(capable), "supported");
  for (const missing of ["serviceWorker", "pushManager", "notification", "secureContext"] as const)
    assert.equal(pushSupport({ ...capable, [missing]: false }), "unsupported");
  // Development builds register no worker.
  assert.equal(pushSupport({ ...capable, serviceWorker: false }), "unsupported");
});

test("iPhone and iPad Safari must install the app before push exists", () => {
  const safari = { ...capable, pushManager: false, appleMobile: true };
  assert.equal(pushSupport(safari), "install-first");
  // Opened from the Home Screen on an iOS version without web push: nothing to install.
  assert.equal(pushSupport({ ...safari, standalone: true }), "unsupported");
  assert.equal(pushSupport({ ...capable, appleMobile: true, standalone: true }), "supported");
});

test("the status follows support, then permission, then the browser subscription", () => {
  assert.equal(pushStatus("unsupported", "granted", true, "confirmed"), "unsupported");
  assert.equal(pushStatus("install-first", null, null, "confirmed"), "install-first");
  assert.equal(pushStatus("supported", "denied", true, "confirmed"), "denied");
  assert.equal(pushStatus("supported", "granted", null, "confirmed"), "checking");
  assert.equal(pushStatus("supported", "granted", true, "confirmed"), "on");
  assert.equal(pushStatus("supported", "granted", false, "confirmed"), "off");
  // A subscription without the permission no longer shows notifications.
  assert.equal(pushStatus("supported", "default", true, "confirmed"), "off");
  assert.equal(pushStatus("supported", "default", false, "confirmed"), "off");
});

// RFC 8291's example application server public key.
const serverKey =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";

test("the server key decodes from base64url and matches only identical subscription keys", () => {
  const bytes = decodeKey(serverKey);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
  assert.equal(Buffer.from(bytes).toString("base64url"), serverKey);
  assert.equal(sameKey(bytes.slice().buffer, serverKey), true);
  const other = bytes.slice();
  other[64] ^= 1;
  assert.equal(sameKey(other.buffer, serverKey), false);
  assert.equal(sameKey(bytes.slice(0, 64).buffer, serverKey), false);
  assert.equal(sameKey(null, serverKey), false);
});

test("a registration needs the endpoint and both keys", () => {
  const json = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "key", auth: "secret" },
  };
  assert.deepEqual(subscriptionBody(json, "it"), {
    endpoint: json.endpoint,
    p256dh: "key",
    auth: "secret",
    language: "it",
  });
  assert.equal(subscriptionBody({ ...json, endpoint: "" }, "zh"), null);
  assert.equal(subscriptionBody({ endpoint: json.endpoint }, "zh"), null);
  assert.equal(subscriptionBody({ ...json, keys: { p256dh: "key" } }, "zh"), null);
});

test("only the app's online order notifications are cleared", () => {
  assert.equal(isOrderNotification("online-order-12"), true);
  assert.equal(isOrderNotification("online-order"), true);
  assert.equal(isOrderNotification("online-orders"), false);
  assert.equal(isOrderNotification(""), false);
});
