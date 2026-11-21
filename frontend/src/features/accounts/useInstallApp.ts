import { useEffect, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";

// Chromium's installation offer, which the DOM typings do not include.
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
type InstallState = { offer: InstallPromptEvent | null; installed: boolean };

export type AppScope = "/staff" | "/platform";
const states: Record<AppScope, InstallState> = {
  "/staff": { offer: null, installed: false },
  "/platform": { offer: null, installed: false },
};
const listeners = new Set<() => void>();

function update(scope: AppScope, next: Partial<InstallState>) {
  states[scope] = { ...states[scope], ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Only the two app layouts register workers and link their own manifests.
export function useInstallableApp(scope: AppScope = "/staff") {
  useEffect(() => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = `${scope}.webmanifest`;
    document.head.append(manifest);
    // The home page offers the installation instead of the browser's own mini-infobar.
    const keepOffer = (event: Event) => {
      event.preventDefault();
      update(scope, { offer: event as InstallPromptEvent });
    };
    const markInstalled = () => update(scope, { offer: null, installed: true });
    window.addEventListener("beforeinstallprompt", keepOffer);
    window.addEventListener("appinstalled", markInstalled);
    // Development keeps plain page loads; `npm run preview` serves the build with the worker.
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker
        .register(scope === "/staff" ? "/sw.js" : "/platform-sw.js", { scope })
        .catch(() => undefined);
    return () => {
      manifest.remove();
      window.removeEventListener("beforeinstallprompt", keepOffer);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, [scope]);
}

// What the home page offers: Chromium's one-tap installation, or nothing inside the installed app.
export function useInstallOffer(scope: AppScope = "/staff") {
  const { offer, installed } = useSyncExternalStore(subscribe, () => states[scope]);
  const standalone =
    useMediaQuery("(display-mode: standalone)") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Called inside a click; each offer can be shown only once.
  function install() {
    if (!offer) return;
    update(scope, { offer: null });
    void offer.prompt().catch(() => undefined);
  }
  return { standalone, installed, canInstall: !!offer, install };
}
