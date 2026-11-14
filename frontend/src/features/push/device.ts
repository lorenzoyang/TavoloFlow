import { pushSupport, isOrderNotification, type PushSupport } from "./state";

// This device's push state, read from the browser. Only production builds register the service
// worker (useInstallableStaffApp), so development reports push as unsupported.
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

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/staff")) ?? null;
}

// Waits for the staff worker to be active, which subscribing needs.
export async function activeRegistration() {
  if (!(await registration())) throw new Error("The staff service worker is not registered.");
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

// Opening the online orders page answers every notification shown on this device.
export async function closeOrderNotifications() {
  const notifications = (await (await registration())?.getNotifications()) ?? [];
  for (const notification of notifications)
    if (isOrderNotification(notification.tag)) notification.close();
}
