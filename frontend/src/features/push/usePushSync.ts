import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { withTimeout } from "@/lib/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { pushKeyQuery, savePushSubscription } from "./api";
import {
  currentSubscription,
  deviceChanged,
  devicePushSupport,
  notificationPermission,
} from "./device";
import { sameKey, subscriptionBody } from "./state";

let requests = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The account just proved new credentials on this device (its own password change), which stopped
// the device on the server: register it again.
export function resyncPush() {
  requests++;
  for (const listener of listeners) listener();
}

// Mounted by StaffLayout. Whoever signs in on a device that kept its browser subscription, with the
// notification permission still granted, registers it again for their account, credential version,
// sign-in and interface language; signing out only removed it on the server. A subscription made
// with an older server key is useless, so it is dropped and the home page offers to turn push on.
// Failures are silent: the next sign-in or page load tries again.
export function usePushSync(account: CurrentAccount | null | undefined) {
  const language = useStaffLanguage();
  const resync = useSyncExternalStore(subscribe, () => requests);
  const active =
    !!account &&
    !account.mustChangePassword &&
    account.services.online &&
    devicePushSupport() === "supported";
  const scope = { restaurantId: account?.restaurantId ?? "", userId: account?.userId ?? "" };
  const key = useQuery({ ...pushKeyQuery(scope), enabled: active }).data?.publicKey ?? null;
  useEffect(() => {
    if (!active || !key || notificationPermission() !== "granted") return;
    const controller = new AbortController();
    void (async () => {
      const subscription = await currentSubscription();
      if (!subscription || controller.signal.aborted) return;
      if (!sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        deviceChanged();
        return;
      }
      const body = subscriptionBody(subscription.toJSON(), language);
      if (body) await savePushSubscription(body, withTimeout(controller.signal));
    })().catch(() => undefined);
    return () => controller.abort();
  }, [active, key, language, scope.restaurantId, scope.userId, resync]);
}
