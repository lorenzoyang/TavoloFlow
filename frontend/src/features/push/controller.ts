import type { Language } from "../../lib/language.ts";
import { createOperations, type Operation } from "../../lib/operations.ts";
import {
  sameKey,
  subscriptionBody,
  type PushSubscriptionBody,
  type PushSupport,
  type RegistrationState,
} from "./state.ts";

// Browser and HTTP boundaries are injected so the same controller can be tested without React or a
// real push service. Only StaffLayout owns one; the home switch and logout share its operations.
export type DeviceSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
};

type Dependencies = {
  support(): PushSupport;
  permission(): NotificationPermission | null;
  requestPermission(): Promise<NotificationPermission>;
  currentSubscription(): Promise<DeviceSubscription | null>;
  subscribe(key: string): Promise<DeviceSubscription>;
  save(body: PushSubscriptionBody, signal: AbortSignal): Promise<void>;
  remove(endpoint: string, signal: AbortSignal): Promise<void>;
  logout(endpoint: string | null, signal: AbortSignal): Promise<void>;
};

export type PushConfiguration = {
  restaurantId: string;
  userId: string;
  active: boolean;
  key: string | null;
  language: Language;
};
type Action = "sync" | "enable" | "disable" | "logout";
export type PushSnapshot = {
  support: PushSupport;
  permission: NotificationPermission | null;
  subscribed: boolean | null;
  registration: RegistrationState;
  busy: Action | null;
  error: unknown;
};

export function createPushController(deps: Dependencies) {
  const operations = createOperations();
  const listeners = new Set<() => void>();
  let config: PushConfiguration | null = null;
  let revision = 0;
  let running: Promise<void> | null = null;
  let runningRevision = 0;
  let logoutTask: Promise<void> | null = null;
  let signingOut = false;
  let snapshot: PushSnapshot = {
    support: deps.support(),
    permission: deps.permission(),
    subscribed: null,
    registration: "unconfirmed",
    busy: null,
    error: null,
  };

  function update(change: Partial<PushSnapshot>) {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  }

  function configure(next: PushConfiguration | null) {
    if (
      next?.restaurantId === config?.restaurantId &&
      next?.userId === config?.userId &&
      next?.active === config?.active &&
      next?.key === config?.key &&
      next?.language === config?.language
    )
      return;
    // A key read or language change must not interrupt this identity's sign-out. Its device will be
    // registered with the latest settings if sign-out fails and a later foreground check runs.
    if (
      signingOut &&
      next?.restaurantId === config?.restaurantId &&
      next?.userId === config?.userId
    ) {
      config = next;
      return;
    }
    revision++;
    operations.cancelAll();
    config = next;
    signingOut = false;
    update({ subscribed: null, registration: "unconfirmed", error: null, busy: null });
  }

  function run(action: Action, work: (operation: Operation) => Promise<void>): Promise<void> {
    const operation = operations.start("push");
    if (!operation) return running ?? Promise.resolve();
    runningRevision = revision;
    update({ busy: action, error: null, registration: "syncing" });
    const task = (async () => {
      try {
        await work(operation);
      } catch (error) {
        if (operation.isCurrent()) {
          update({ registration: "failed", error: action === "logout" ? null : error });
        }
        if (action === "logout") throw error;
      } finally {
        if (operation.finish()) update({ busy: null });
      }
    })();
    running = task;
    // Clear only this task; an obsolete identity must not clear a newer task's reference.
    void task
      .finally(() => {
        if (running === task) running = null;
      })
      .catch(() => undefined);
    return task;
  }

  async function register(
    subscription: DeviceSubscription,
    scope: PushConfiguration,
    op: Operation,
  ) {
    if (!op.isCurrent()) return;
    update({ subscribed: true });
    const body = subscriptionBody(subscription.toJSON(), scope.language);
    if (!body) throw new Error("The browser subscription has no keys.");
    await deps.save(body, op.signal);
    if (op.isCurrent()) update({ registration: "confirmed" });
  }

  function sync(): Promise<void> {
    const scope = config;
    if (signingOut || !scope?.active || !scope.key || snapshot.support !== "supported")
      return Promise.resolve();
    if (running) {
      if (runningRevision === revision) return running;
      // A changed identity/language waits for the obsolete operation, then uses only the latest scope.
      const requested = revision;
      return running
        .catch(() => undefined)
        .then(() => {
          if (requested === revision) return sync();
        });
    }
    return run("sync", async (op) => {
      const permission = deps.permission();
      update({ permission });
      if (permission !== "granted") {
        update({ subscribed: false, registration: "unconfirmed" });
        return;
      }
      const subscription = await deps.currentSubscription();
      if (!op.isCurrent()) return;
      if (!subscription) {
        update({ subscribed: false, registration: "unconfirmed" });
        return;
      }
      if (!sameKey(subscription.options.applicationServerKey, scope.key!)) {
        await subscription.unsubscribe();
        if (op.isCurrent()) update({ subscribed: false, registration: "unconfirmed" });
        return;
      }
      await register(subscription, scope, op);
    });
  }

  function enable(): Promise<void> {
    const scope = config;
    if (signingOut || running || !scope?.active || !scope.key) return Promise.resolve();
    return run("enable", async (op) => {
      // Keep this call before the first await: Safari requires the user's tap.
      const permission = await deps.requestPermission();
      if (!op.isCurrent()) return;
      update({ permission });
      if (permission !== "granted") {
        update({ subscribed: false, registration: "unconfirmed" });
        return;
      }
      let subscription = await deps.currentSubscription();
      if (!op.isCurrent()) return;
      if (subscription && !sameKey(subscription.options.applicationServerKey, scope.key!)) {
        await subscription.unsubscribe();
        if (!op.isCurrent()) return;
        subscription = null;
      }
      update({ subscribed: !!subscription });
      subscription ??= await deps.subscribe(scope.key!);
      await register(subscription, scope, op);
      // A failed PUT keeps the browser subscription for an explicit or foreground sync retry.
    });
  }

  function disable(): Promise<void> {
    if (signingOut || running) return Promise.resolve();
    return run("disable", async (op) => {
      const subscription = await deps.currentSubscription();
      if (!op.isCurrent()) return;
      if (subscription) {
        await deps.remove(subscription.endpoint, op.signal).catch(() => undefined);
        if (!op.isCurrent()) return;
        await subscription.unsubscribe();
      }
      if (op.isCurrent()) update({ subscribed: false, registration: "unconfirmed" });
    });
  }

  function logout(): Promise<void> {
    if (logoutTask) return logoutTask;
    signingOut = true;
    const requested = revision;
    // Do not abort an in-flight registration: let it settle before the server revokes the row.
    const pending = running;
    update({ registration: "unconfirmed" });
    logoutTask = (async () => {
      await pending?.catch(() => undefined);
      if (requested !== revision) throw new Error("The signed-in account changed.");
      await run("logout", async (op) => {
        // A browser read failure must not be mistaken for a device without a subscription.
        const subscription = await deps.currentSubscription();
        if (!op.isCurrent()) throw new Error("The signed-in account changed.");
        await deps.logout(subscription?.endpoint ?? null, op.signal);
        if (!op.isCurrent()) throw new Error("The signed-in account changed.");
        update({ registration: "unconfirmed" });
      });
    })();
    const task = logoutTask;
    void task
      .finally(() => {
        if (logoutTask === task) logoutTask = null;
        // Success stays paused until the account changes. On failure the user can retry or sync again.
      })
      .catch(() => undefined);
    return task.catch((error: unknown) => {
      if (requested === revision) signingOut = false;
      throw error;
    });
  }

  function cancel() {
    revision++;
    operations.cancelAll();
  }

  return {
    configure,
    sync,
    enable,
    disable,
    logout,
    cancel,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
