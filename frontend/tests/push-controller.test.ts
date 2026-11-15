import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPushController,
  type DeviceSubscription,
  type PushConfiguration,
} from "../src/features/push/controller.ts";
import { decodeKey, pushStatus, type PushSubscriptionBody } from "../src/features/push/state.ts";

const key =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const config: PushConfiguration = {
  restaurantId: "restaurant",
  userId: "staff",
  active: true,
  key,
  language: "it",
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function device(endpoint = "https://fcm.googleapis.com/fcm/send/device", serverKey = key) {
  let unsubscribed = 0;
  const subscription: DeviceSubscription = {
    endpoint,
    options: { applicationServerKey: decodeKey(serverKey).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: "device-key", auth: "secret" } }),
    unsubscribe: async () => {
      unsubscribed++;
      return true;
    },
  };
  return { subscription, unsubscribed: () => unsubscribed };
}

function setup(overrides: Partial<Parameters<typeof createPushController>[0]> = {}) {
  const browser = device();
  const saved: PushSubscriptionBody[] = [];
  const removed: string[] = [];
  const logouts: (string | null)[] = [];
  let permission: NotificationPermission = "granted";
  let subscription: DeviceSubscription | null = browser.subscription;
  let prompts = 0;
  let subscriptions = 0;
  const controller = createPushController({
    support: () => "supported",
    permission: () => permission,
    requestPermission: async () => {
      prompts++;
      return permission;
    },
    currentSubscription: async () => subscription,
    subscribe: async () => {
      subscriptions++;
      return browser.subscription;
    },
    save: async (body) => {
      saved.push(body);
    },
    remove: async (endpoint) => {
      removed.push(endpoint);
    },
    logout: async (endpoint) => {
      logouts.push(endpoint);
    },
    ...overrides,
  });
  controller.configure(config);
  return {
    controller,
    browser,
    saved,
    removed,
    logouts,
    prompts: () => prompts,
    subscriptions: () => subscriptions,
    permission: (value: NotificationPermission) => (permission = value),
    subscription: (value: DeviceSubscription | null) => (subscription = value),
    status: () => {
      const state = controller.getSnapshot();
      return pushStatus(state.support, state.permission, state.subscribed, state.registration);
    },
  };
}

test("a failed registration never shows on; a later foreground sync repairs it without prompting", async () => {
  let fail = true;
  const view = setup({
    save: async () => {
      if (fail) throw new Error("network unavailable");
    },
  });
  await view.controller.sync();
  assert.equal(view.status(), "sync-failed");
  assert.equal(view.controller.getSnapshot().subscribed, true);
  assert.equal(view.browser.unsubscribed(), 0);
  fail = false;
  await view.controller.sync();
  assert.equal(view.status(), "on");
  assert.equal(view.prompts(), 0);
});

test("enabling asks for permission inside the tap; a failed PUT keeps the subscription for retry", async () => {
  const gate = deferred();
  let prompted = false;
  let fail = true;
  const view = setup({
    requestPermission: async () => {
      prompted = true;
      await gate.promise;
      return "granted";
    },
    save: async () => {
      if (fail) throw new Error("temporary failure");
    },
  });
  view.subscription(null);
  const enabling = view.controller.enable();
  assert.equal(prompted, true);
  gate.resolve();
  await enabling;
  assert.equal(view.subscriptions(), 1);
  assert.equal(view.browser.unsubscribed(), 0);
  assert.equal(view.status(), "sync-failed");
  view.subscription(view.browser.subscription);
  fail = false;
  await view.controller.sync();
  assert.equal(view.status(), "on");
});

test("concurrent foreground events share one registration", async () => {
  const gate = deferred();
  let writes = 0;
  const view = setup({
    save: async () => {
      writes++;
      await gate.promise;
    },
  });
  const first = view.controller.sync();
  assert.equal(view.controller.sync(), first);
  await flush();
  assert.equal(writes, 1);
  assert.equal(view.status(), "syncing");
  gate.resolve();
  await first;
  assert.equal(view.status(), "on");
});

test("a rotated endpoint is registered on resume and an old VAPID key requires a new tap", async () => {
  const view = setup();
  await view.controller.sync();
  const next = device("https://fcm.googleapis.com/fcm/send/rotated");
  view.subscription(next.subscription);
  await view.controller.sync();
  assert.equal(view.saved.at(-1)?.endpoint, next.subscription.endpoint);
  assert.equal(view.status(), "on");
  const otherKey = new Uint8Array(decodeKey(key));
  otherKey[64] ^= 1;
  next.subscription.options.applicationServerKey = otherKey.buffer;
  await view.controller.sync();
  assert.equal(view.status(), "off");
  assert.equal(next.unsubscribed(), 1);
  assert.equal(view.subscriptions(), 0);
});

test("permission changes are reread and cannot retain a confirmed on state", async () => {
  const view = setup();
  await view.controller.sync();
  view.permission("denied");
  await view.controller.sync();
  assert.equal(view.status(), "denied");
  view.permission("default");
  await view.controller.sync();
  assert.equal(view.status(), "off");
  assert.equal(view.saved.length, 1);
  assert.equal(view.prompts(), 0);
});

test("an obsolete identity's late failure cannot overwrite the next registration", async () => {
  const gate = deferred();
  const bodies: PushSubscriptionBody[] = [];
  const view = setup({
    save: async (body) => {
      bodies.push(body);
      if (bodies.length === 1) await gate.promise;
    },
  });
  const first = view.controller.sync();
  await flush();
  view.controller.configure({ ...config, userId: "owner", language: "zh" });
  const next = view.controller.sync();
  assert.equal(view.status(), "checking");
  gate.reject(new Error("old request failed"));
  await Promise.all([first, next]);
  assert.deepEqual(
    bodies.map((body) => body.language),
    ["it", "zh"],
  );
  assert.equal(view.status(), "on");
  assert.equal(view.controller.getSnapshot().error, null);
});

test("logout waits for registration, blocks resync and keeps the browser subscription", async () => {
  const registration = deferred();
  const exiting = deferred();
  const events: string[] = [];
  const view = setup({
    save: async () => {
      events.push("save-start");
      await registration.promise;
      events.push("save-end");
    },
    logout: async (endpoint) => {
      assert.equal(endpoint, view.browser.subscription.endpoint);
      events.push("logout");
      await exiting.promise;
    },
  });
  const syncing = view.controller.sync();
  await flush();
  const logout = view.controller.logout();
  await view.controller.sync();
  assert.deepEqual(events, ["save-start"]);
  registration.resolve();
  await syncing;
  await flush();
  await view.controller.sync();
  assert.deepEqual(events, ["save-start", "save-end", "logout"]);
  exiting.resolve();
  await logout;
  await view.controller.sync();
  assert.equal(events.length, 3);
  assert.equal(view.browser.unsubscribed(), 0);
  assert.notEqual(view.status(), "on");
});

test("failed logout propagates for retry and a browser read failure never sends logout", async () => {
  let fail = true;
  let attempts = 0;
  const view = setup({
    logout: async () => {
      attempts++;
      if (fail) throw new Error("revocation failed");
    },
  });
  await assert.rejects(view.controller.logout(), /revocation failed/);
  assert.equal(view.browser.unsubscribed(), 0);
  fail = false;
  await view.controller.logout();
  assert.equal(attempts, 2);
  const unreadable = setup({
    currentSubscription: async () => {
      throw new Error("browser unavailable");
    },
  });
  await assert.rejects(unreadable.controller.logout(), /browser unavailable/);
  assert.equal(unreadable.logouts.length, 0);
});

test("logout works before first password change and when push is not configured", async () => {
  const view = setup();
  view.controller.configure({ ...config, active: false, key: null });
  await view.controller.logout();
  assert.deepEqual(view.logouts, [view.browser.subscription.endpoint]);
  const empty = setup();
  empty.subscription(null);
  await empty.controller.logout();
  assert.deepEqual(empty.logouts, [null]);
});

test("turning off removes the server row and browser subscription and does not overlap a sync", async () => {
  const gate = deferred();
  const view = setup({ save: async () => gate.promise });
  const syncing = view.controller.sync();
  await view.controller.disable();
  assert.equal(view.removed.length, 0);
  gate.resolve();
  await syncing;
  await view.controller.disable();
  assert.deepEqual(view.removed, [view.browser.subscription.endpoint]);
  assert.equal(view.browser.unsubscribed(), 1);
  assert.equal(view.status(), "off");
});

test("settings changing during logout cannot abort revocation or restart registration", async () => {
  const gate = deferred();
  let signal: AbortSignal | undefined;
  const view = setup({
    logout: async (_, requestSignal) => {
      signal = requestSignal;
      await gate.promise;
    },
  });
  const exiting = view.controller.logout();
  await flush();
  view.controller.configure({ ...config, language: "en", key: null });
  await view.controller.sync();
  assert.equal(signal?.aborted, false);
  assert.equal(view.saved.length, 0);
  gate.resolve();
  await exiting;
});

test("unmounting discards a late registration success and cannot leave a newer sync busy", async () => {
  const gate = deferred();
  let writes = 0;
  const view = setup({
    save: async () => {
      if (++writes === 1) await gate.promise;
    },
  });
  const first = view.controller.sync();
  await flush();
  view.controller.cancel();
  const resumed = view.controller.sync();
  gate.resolve();
  await Promise.all([first, resumed]);
  assert.equal(writes, 2);
  assert.equal(view.status(), "on");
  assert.equal(view.controller.getSnapshot().busy, null);
});
