import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createPushController, type DeviceSubscription } from "../src/features/push/controller.ts";
import { activeRegistration, currentSubscription } from "../src/features/push/device.ts";

function mockNavigator(t: TestContext, value: object) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
}

function navigatorWithRegistration(registration: unknown) {
  return {
    serviceWorker: {
      getRegistration: async (scope: string) => {
        assert.equal(scope, "/staff");
        return registration;
      },
    },
  };
}

const subscription: DeviceSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device",
  options: { applicationServerKey: null },
  toJSON: () => ({ endpoint: subscription.endpoint }),
  unsubscribe: async () => assert.fail("Logout must retain the browser subscription."),
};

function setupLogout() {
  const logouts: (string | null)[] = [];
  const unexpected = async () =>
    assert.fail("Logout must not register or remove a browser device.");
  const controller = createPushController({
    support: () => "unsupported",
    permission: () => null,
    requestPermission: unexpected,
    currentSubscription,
    subscribe: unexpected,
    save: unexpected,
    remove: unexpected,
    logout: async (endpoint) => {
      logouts.push(endpoint);
    },
  });
  controller.configure({
    restaurantId: "restaurant",
    userId: "staff",
    active: false,
    key: null,
    language: "it",
  });
  return { controller, logouts };
}

for (const [missing, navigator] of [
  ["Service Worker API", {}],
  ["staff registration", navigatorWithRegistration(undefined)],
  ["PushManager on the registration", navigatorWithRegistration({})],
] as const) {
  test(`missing ${missing} means no subscription and allows logout`, async (t) => {
    mockNavigator(t, navigator);
    assert.equal(await currentSubscription(), null);
    const view = setupLogout();
    await view.controller.logout();
    assert.deepEqual(view.logouts, [null]);
  });
}

test("an available PushManager with no subscription returns null", async (t) => {
  mockNavigator(
    t,
    navigatorWithRegistration({ pushManager: { getSubscription: async () => null } }),
  );
  assert.equal(await currentSubscription(), null);
});

test("logout revokes a readable subscription even when overall push support is unsupported", async (t) => {
  mockNavigator(
    t,
    navigatorWithRegistration({ pushManager: { getSubscription: async () => subscription } }),
  );
  assert.equal(await currentSubscription(), subscription);
  const view = setupLogout();
  await view.controller.logout();
  assert.deepEqual(view.logouts, [subscription.endpoint]);
});

for (const source of ["registration", "subscription"] as const) {
  test(`a real ${source} read failure propagates and prevents logout`, async (t) => {
    const error = new Error(`${source} unavailable`);
    const fail = async () => {
      throw error;
    };
    mockNavigator(
      t,
      source === "registration"
        ? { serviceWorker: { getRegistration: fail } }
        : navigatorWithRegistration({ pushManager: { getSubscription: fail } }),
    );
    await assert.rejects(currentSubscription(), (reason) => reason === error);
    const view = setupLogout();
    await assert.rejects(view.controller.logout(), (reason) => reason === error);
    assert.deepEqual(view.logouts, []);
  });
}

test("push activation uses the requested app worker after moving between apps", async (t) => {
  const staff = { active: {} };
  const platform = { active: {} };
  mockNavigator(t, {
    serviceWorker: {
      ready: Promise.resolve(staff),
      getRegistration: async (scope: string) => (scope === "/platform" ? platform : staff),
    },
  });
  assert.equal(await activeRegistration("/platform"), platform);
  assert.equal(await activeRegistration(), staff);
});
