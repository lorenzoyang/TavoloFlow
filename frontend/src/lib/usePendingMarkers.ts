import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLive } from "./useLiveView";

type Options<T> = {
  // Tab storage key, scoped to the restaurant and account.
  storageKey: string;
  // Validates stored JSON; unreadable or foreign entries are dropped, never turned into writes.
  parse: (raw: string | null) => T[];
  // The resource a marker belongs to (an order, a visit): one marker per resource.
  idOf: (marker: T) => string;
  // Checks one marker's outcome by GET of the original resource; never resends the write.
  recover: (marker: T) => void;
  intervalMs?: number;
};

// Unknown-result markers: the minimal identifiers of a write, saved in sessionStorage before its POST,
// so that a result lost to a timeout, a closed tab or a reload can be checked later by GET. Recovery
// runs once after mount and then on a timer while the page is live; the page also calls recoverAll()
// after a lifecycle change, once it has cancelled its own work.
export function usePendingMarkers<T>({
  storageKey,
  parse,
  idOf,
  recover,
  intervalMs = 10_000,
}: Options<T>) {
  const [markers, setMarkers] = useState<T[]>(() => {
    try {
      return parse(sessionStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });
  // Writes read the latest markers synchronously, before React re-renders.
  const latest = useRef(markers);
  // Without storage a marker still protects this page, but would not survive a reload.
  const [storageWarning, setStorageWarning] = useState(false);
  const recoverRef = useRef(recover);
  useEffect(() => {
    recoverRef.current = recover;
  }, [recover]);

  const save = useCallback(
    (next: T[]) => {
      latest.current = next;
      setMarkers(next);
      try {
        if (next.length) sessionStorage.setItem(storageKey, JSON.stringify(next));
        else sessionStorage.removeItem(storageKey);
      } catch {
        setStorageWarning(true);
      }
    },
    [storageKey],
  );

  const actions = useMemo(
    () => ({
      has: (id: string) => latest.current.some((marker) => idOf(marker) === id),
      add: (marker: T) => save([...latest.current, marker]),
      remove: (id: string) => save(latest.current.filter((marker) => idOf(marker) !== id)),
      recoverAll: () => {
        if (isLive()) for (const marker of latest.current) recoverRef.current(marker);
      },
      // Called on unmount when the account changed: markers belong to the identity that wrote them.
      discardStored: () => {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Identity-scoped memory is discarded too. */
        }
      },
    }),
    [idOf, save, storageKey],
  );

  const { recoverAll } = actions;
  useEffect(() => {
    // Scheduled after mount, so StrictMode's setup/cleanup probe cannot cancel the only recovery.
    const initial = window.setTimeout(recoverAll, 0);
    const timer = window.setInterval(recoverAll, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [recoverAll, intervalMs]);

  return { markers, storageWarning, ...actions };
}
