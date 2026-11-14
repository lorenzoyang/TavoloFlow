import { isLanguage, type Language } from "../../lib/language.ts";

// Lock-screen push for new online orders: pure rules, tested in Node.

export type PushEnvironment = {
  // A production build registers the staff service worker; development has none.
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  secureContext: boolean;
  appleMobile: boolean;
  standalone: boolean;
};

export type PushSupport = "supported" | "install-first" | "unsupported";
export type RegistrationState = "unconfirmed" | "syncing" | "confirmed" | "failed";

// iPhone and iPad offer push only to the web app opened from the Home Screen, so there the answer is
// "install first" rather than "unsupported".
export function pushSupport(env: PushEnvironment): PushSupport {
  if (env.secureContext && env.serviceWorker && env.pushManager && env.notification)
    return "supported";
  if (env.appleMobile && !env.standalone) return "install-first";
  return "unsupported";
}

export type PushStatus =
  | "checking"
  | "unsupported"
  | "install-first"
  | "denied"
  | "off"
  | "on"
  | "syncing"
  | "sync-failed";

// A browser subscription alone does not mean the server knows about it. Only a successful PUT for
// the current identity, language and key confirms that this device is registered.
export function pushStatus(
  support: PushSupport,
  permission: NotificationPermission | null,
  subscribed: boolean | null,
  registration: RegistrationState,
): PushStatus {
  if (support !== "supported") return support;
  if (permission === "denied") return "denied";
  if (registration === "failed") return "sync-failed";
  if (subscribed === null) return "checking";
  if (!subscribed || permission !== "granted") return "off";
  return registration === "confirmed" ? "on" : "syncing";
}

// The server's VAPID public key, base64url, as the bytes PushManager.subscribe expects.
export function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// Whether a subscription was made with the server's current key; a new server key makes old
// subscriptions useless.
export function sameKey(subscriptionKey: ArrayBuffer | null, serverKey: string): boolean {
  if (!subscriptionKey) return false;
  const current = new Uint8Array(subscriptionKey);
  const expected = decodeKey(serverKey);
  return current.length === expected.length && current.every((byte, i) => byte === expected[i]);
}

export type PushSubscriptionBody = {
  endpoint: string;
  p256dh: string;
  auth: string;
  language: Language;
};

// The registration request for a browser subscription, or null when it lacks its keys.
export function subscriptionBody(
  json: { endpoint?: string; keys?: Record<string, string> },
  language: Language,
): PushSubscriptionBody | null {
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth || !isLanguage(language)) return null;
  return { endpoint: json.endpoint, p256dh, auth, language };
}

// Notifications this app showed for online orders (sw.js tags them online-order-{number}).
export const isOrderNotification = (tag: string) =>
  tag === "online-order" || tag.startsWith("online-order-");
