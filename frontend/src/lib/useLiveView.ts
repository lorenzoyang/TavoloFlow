import { useEffect, useState } from "react";

// Online and in the foreground: the only state in which a live view polls or writes.
export const isLive = () => navigator.onLine && document.visibilityState === "visible";

// Calls the handler on every connectivity or visibility change; returns the cleanup for an effect.
export function onLifecycleChange(handler: () => void) {
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  document.addEventListener("visibilitychange", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
    document.removeEventListener("visibilitychange", handler);
  };
}

// Whether the view is live, when it last resumed (data received before that is stale), and a 1-second clock.
export function useLiveView() {
  const [active, setActive] = useState(isLive);
  const [resumeAfter, setResumeAfter] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const stop = onLifecycleChange(() => { setActive(isLive()); setResumeAfter(Date.now()); setNow(Date.now()); });
    return () => { window.clearInterval(tick); stop(); };
  }, []);
  return { active, resumeAfter, now };
}
