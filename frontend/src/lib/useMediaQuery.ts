import { useCallback, useSyncExternalStore } from "react";

// The lg breakpoint (64rem): wide enough to show a list and its detail side by side.
export const WIDE_SCREEN = "(min-width: 64rem)";

// The first render already reads the current match, so a layout never mounts in the wrong shape.
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
