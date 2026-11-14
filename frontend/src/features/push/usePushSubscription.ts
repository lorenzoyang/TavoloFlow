import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { withTimeout } from "@/lib/api";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { pushKeyQuery, removePushSubscription, savePushSubscription } from "./api";
import {
  activeRegistration,
  currentSubscription,
  devicePushSupport,
  notificationPermission,
  onDeviceChange,
} from "./device";
import { decodeKey, pushStatus, sameKey, subscriptionBody } from "./state";

// The home page's switch for this device. Turning on asks for the notification permission, subscribes
// with the server's key and registers the device; any failure drops the browser subscription again,
// so the page never shows "on" for a device the server may not know. Turning off removes the server
// row (best effort) and the browser subscription, which also stops automatic registration at sign-in.
export function usePushSubscription(account: CurrentAccount) {
  const language = useStaffLanguage();
  const keyQuery = useQuery(pushKeyQuery(account));
  const key = keyQuery.data?.publicKey ?? null;
  const [support] = useState(devicePushSupport);
  const [permission, setPermission] = useState(notificationPermission);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"enable" | "disable" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const operations = useOperations();

  useEffect(() => {
    if (support !== "supported" || !key) return;
    let current = true;
    const read = () => {
      setPermission(notificationPermission());
      currentSubscription().then(
        (subscription) => {
          if (current)
            setSubscribed(
              !!subscription && sameKey(subscription.options.applicationServerKey, key),
            );
        },
        () => {
          if (current) setSubscribed(false);
        },
      );
    };
    read();
    const stop = onDeviceChange(read);
    return () => {
      current = false;
      stop();
    };
  }, [support, key]);

  // Called inside the tap: Safari grants the permission prompt only to a user gesture.
  async function enable() {
    if (!key) return;
    const operation = operations.start("push");
    if (!operation) return;
    setBusy("enable");
    setError(null);
    let subscription: PushSubscription | null = null;
    try {
      const granted = await Notification.requestPermission();
      if (!operation.isCurrent()) return;
      setPermission(granted);
      if (granted !== "granted") return;
      const registration = await activeRegistration();
      subscription = await registration.pushManager.getSubscription();
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key),
      });
      const body = subscriptionBody(subscription.toJSON(), language);
      if (!body) throw new Error("The browser subscription has no keys.");
      await savePushSubscription(body, withTimeout(operation.signal));
      if (operation.isCurrent()) setSubscribed(true);
    } catch (failure) {
      await subscription?.unsubscribe().catch(() => undefined);
      if (operation.isCurrent()) {
        setSubscribed(false);
        setError(failure);
      }
    } finally {
      if (operation.finish()) setBusy(null);
    }
  }

  async function disable() {
    const operation = operations.start("push");
    if (!operation) return;
    setBusy("disable");
    setError(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint, withTimeout(operation.signal)).catch(
          () => undefined,
        );
        // Without the browser subscription the push service rejects the endpoint, so the server
        // drops a row the request above could not remove.
        await subscription.unsubscribe();
      }
      if (operation.isCurrent()) setSubscribed(false);
    } catch (failure) {
      if (operation.isCurrent()) setError(failure);
    } finally {
      if (operation.finish()) setBusy(null);
    }
  }

  return {
    // Hidden while the server's key is loading or push is off on the server.
    configured: key !== null,
    status: pushStatus(support, permission, subscribed),
    busy,
    error,
    enable,
    disable,
  };
}
