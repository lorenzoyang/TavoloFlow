import type { AppScope } from "../accounts/useInstallApp";
import { pushSupport, isOrderNotification, type PushSupport } from "./state.ts";

// This device's push state, read from the browser. Only production builds register the service
// worker (useInstallableApp), so development reports push as unsupported.
export function devicePushSupport(): PushSupport {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return pushSupport({
    serviceWorker: import.meta.env.PROD && "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    secureContext: window.isSecureContext,
    appleMobile:
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1),
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true,
  });
}

export const notificationPermission = (): NotificationPermission | null =>
  "Notification" in window ? Notification.permission : null;

async function registration(scope: AppScope = "/staff") {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration(scope)) ?? null;
}

// Use this scope's worker even when the SPA has already been controlled by the other app.
export async function activeRegistration(scope: AppScope = "/staff") {
  const current = await registration(scope);
  if (!current) throw new Error("The app service worker is not registered.");
  if (current.active) return current;

  const pending = current.installing ?? current.waiting;
  if (!pending) throw new Error("The app service worker is unavailable.");
  await new Promise<void>((resolve, reject) => {
    const settled = () => {
      if (pending.state !== "activated" && pending.state !== "redundant") return;
      pending.removeEventListener("statechange", settled);
      if (pending.state === "activated") resolve();
      else reject(new Error("The app service worker could not activate."));
    };
    pending.addEventListener("statechange", settled);
    settled();
  });
  return current;
}

export async function currentSubscription(scope: AppScope = "/staff") {
  const current = await registration(scope);
  // Some browsers support service workers without the Push API.
  if (!current?.pushManager) return null;
  return (await current.pushManager.getSubscription()) ?? null;
}

// Opening the online orders page answers every notification shown on this device.
export async function closeOrderNotifications() {
  const notifications = (await (await registration())?.getNotifications()) ?? [];
  for (const notification of notifications)
    if (isOrderNotification(notification.tag)) notification.close();
}
