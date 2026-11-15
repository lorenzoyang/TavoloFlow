import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { logout } from "@/features/accounts/api";
import type { CurrentAccount } from "@/features/accounts/api";
import { withTimeout } from "@/lib/api";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { pushKeyQuery, removePushSubscription, savePushSubscription } from "./api";
import { createPushController } from "./controller";
import {
  activeRegistration,
  currentSubscription,
  devicePushSupport,
  notificationPermission,
} from "./device";
import { decodeKey, pushStatus } from "./state";

// StaffLayout owns the sole controller. Foreground events reconcile the browser and server without
// timers, background writes or another permission prompt; concurrent events share the same request.
export function usePushSync(account: CurrentAccount | null | undefined) {
  const language = useStaffLanguage();
  const [controller] = useState(() =>
    createPushController({
      support: devicePushSupport,
      permission: notificationPermission,
      requestPermission: () => Notification.requestPermission(),
      currentSubscription,
      subscribe: async (key) =>
        (await activeRegistration()).pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(key),
        }),
      save: (body, signal) => savePushSubscription(body, withTimeout(signal)),
      remove: (endpoint, signal) => removePushSubscription(endpoint, withTimeout(signal)),
      logout: (endpoint, signal) => logout(endpoint, withTimeout(signal)),
    }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const active = !!account && !account.mustChangePassword && account.services.online;
  const restaurantId = account?.restaurantId ?? "";
  const userId = account?.userId ?? "";
  const key =
    useQuery({
      ...pushKeyQuery({ restaurantId, userId }),
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
