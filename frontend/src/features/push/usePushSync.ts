import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { logout } from "@/features/accounts/api";
import type { CurrentAccount } from "@/features/accounts/api";
import type { AppScope } from "@/features/accounts/useInstallApp";
import { platformLogout } from "@/features/platform/api";
import type { PlatformIdentity } from "@/features/platform/identity";
import { withTimeout } from "@/lib/api";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  readPushKey,
  removePlatformDevice,
  removePushSubscription,
  savePlatformDevice,
  savePushSubscription,
} from "./api";
import { createPushController } from "./controller";
import {
  activeRegistration,
  currentSubscription,
  devicePushSupport,
  notificationPermission,
} from "./device";
import { decodeKey, pushStatus } from "./state";

// Each app layout owns one controller. Foreground events reconcile the browser and server without
// timers, background writes or another permission prompt; concurrent events share the same request.
export function usePushSync(
  account: CurrentAccount | PlatformIdentity | null | undefined,
  scope: AppScope = "/staff",
) {
  const platform = scope === "/platform";
  const language = useStaffLanguage();
  const [controller] = useState(() =>
    createPushController({
      support: devicePushSupport,
      permission: notificationPermission,
      requestPermission: () => Notification.requestPermission(),
      currentSubscription: () => currentSubscription(scope),
      subscribe: async (key) =>
        (await activeRegistration(scope)).pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(key),
        }),
      save: (body, signal) =>
        (platform ? savePlatformDevice : savePushSubscription)(body, withTimeout(signal)),
      remove: (endpoint, signal) =>
        (platform ? removePlatformDevice : removePushSubscription)(endpoint, withTimeout(signal)),
      logout: (endpoint, signal) =>
        (platform ? platformLogout : logout)(endpoint, withTimeout(signal)),
    }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const storeAccount = account && "restaurantId" in account ? account : null;
  const active = platform
    ? !!account
    : !!storeAccount?.services.online && !storeAccount.mustChangePassword;
  const restaurantId = storeAccount?.restaurantId ?? "";
  const userId = account?.userId ?? "";
  const key =
    useQuery({
      queryKey: platform ? ["platform", "push-key", userId] : ["push-key", restaurantId, userId],
      queryFn: ({ signal }) => readPushKey(scope, signal),
      staleTime: 5 * 60_000,
      // Unsupported devices still show the home section's installation/support guidance.
      enabled: active,
    }).data?.publicKey ?? null;

  useEffect(() => {
    controller.configure(userId ? { restaurantId, userId, active, key, language } : null);
    if (isLive()) void controller.sync();
  }, [controller, restaurantId, userId, active, key, language]);

  useEffect(() => {
    const reconcile = () => {
      if (isLive()) void controller.sync();
    };
    const stop = onLifecycleChange(reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      stop();
      window.removeEventListener("focus", reconcile);
      controller.cancel();
    };
  }, [controller]);

  return {
    ...snapshot,
    configured: key !== null,
    status: pushStatus(
      snapshot.support,
      snapshot.permission,
      snapshot.subscribed,
      snapshot.registration,
    ),
    sync: controller.sync,
    enable: controller.enable,
    disable: controller.disable,
    logout: controller.logout,
  };
}
