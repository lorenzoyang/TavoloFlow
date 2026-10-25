import { useEffect, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";

// Chromium's installation offer, which the DOM typings do not include.
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
type InstallState = { offer: InstallPromptEvent | null; installed: boolean };

let state: InstallState = { offer: null, installed: false };
const listeners = new Set<() => void>();

function update(next: Partial<InstallState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Makes the staff area an installable app while a staff page is shown. Only this layout links
// the manifest and registers the service worker, so guests on /q/* are never offered an
// installation and their pages are never controlled. The scope is /staff without a trailing
// slash: the router drops trailing slashes, and the home page /staff must be inside the app.
export function useInstallableStaffApp() {
  useEffect(() => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/staff.webmanifest";
    document.head.append(manifest);
    // The home page offers the installation instead of the browser's own mini-infobar.
    const keepOffer = (event: Event) => {
      event.preventDefault();
      update({ offer: event as InstallPromptEvent });
    };
    const markInstalled = () => update({ offer: null, installed: true });
    window.addEventListener("beforeinstallprompt", keepOffer);
    window.addEventListener("appinstalled", markInstalled);
    // Development keeps plain page loads; `npm run preview` serves the build with the worker.
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/staff" }).catch(() => undefined);
    return () => {
      manifest.remove();
      window.removeEventListener("beforeinstallprompt", keepOffer);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);
}

// What the home page offers: Chromium's one-tap installation, or nothing inside the installed app.
export function useInstallOffer() {
  const { offer, installed } = useSyncExternalStore(subscribe, () => state);
  const standalone =
    useMediaQuery("(display-mode: standalone)") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Called inside a click; each offer can be shown only once.
  function install() {
    if (!offer) return;
    update({ offer: null });
    void offer.prompt().catch(() => undefined);
  }
  return { standalone, installed, canInstall: !!offer, install };
}
