import { useCallback, useEffect, useRef, useState } from "react";

// A device preference rather than account data: a kitchen tablet keeps it across reloads and sign-ins.
const preferenceKey = "tavoloflow:keep-screen-on";

function readPreference() {
  try {
    return localStorage.getItem(preferenceKey) === "on";
  } catch {
    return false;
  }
}

function savePreference(on: boolean) {
  try {
    if (on) localStorage.setItem(preferenceKey, "on");
    else localStorage.removeItem(preferenceKey);
  } catch {
    /* The switch still works for this page without storage. */
  }
}

// Keeps the screen on while the page is visible (Screen Wake Lock API). Browsers release the lock
// whenever the page is hidden, so it is requested again on each return to the foreground. A refused
// request (no user gesture yet, battery saver) turns the switch off so the cook can tap it again.
export function useWakeLock() {
  const supported = "wakeLock" in navigator;
  const [enabled, setEnabled] = useState(() => supported && readPreference());
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function acquire() {
      if (document.visibilityState !== "visible" || sentinel.current) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
        lock.addEventListener("release", () => {
          if (sentinel.current === lock) sentinel.current = null;
        });
      } catch {
        if (cancelled) return;
        setFailed(true);
        setEnabled(false);
      }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel.current?.release();
      sentinel.current = null;
    };
  }, [enabled]);
  const toggle = useCallback(() => {
    savePreference(!enabled);
    setEnabled(!enabled);
    setFailed(false);
  }, [enabled]);
  return { supported, enabled, failed, toggle };
}
