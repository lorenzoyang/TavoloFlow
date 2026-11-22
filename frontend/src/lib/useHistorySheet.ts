import { useEffect, useRef, useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

export type HistorySheet = "cart" | "options" | "categories" | "staff-order-options";

declare module "@tanstack/react-router" {
  interface HistoryState {
    // An open bottom sheet (useHistorySheet).
    sheet?: HistorySheet;
  }
}

// Treat a bottom sheet (the cart, a dish's options) as a step in the browser history. Opening
// it adds an entry that only marks the sheet in its state, with the same URL, so the back gesture
// (Android's back button, an iPhone's edge swipe, an in-app browser's back arrow) closes the sheet
// instead of leaving the page, where a closed tab would lose the cart. Closing it from the page goes
// back over that entry. The router scrolls every history step to the top, so closing restores the
// scroll position the page had when the sheet opened.
export function useHistorySheet(
  name: HistorySheet,
  restoreOnMount = true,
  scrollElement?: () => HTMLElement | null,
) {
  const router = useRouter();
  const state = useLocation({ select: (location) => location.state });
  const marked = state.sheet === name;
  const key = state.__TSR_key ?? state.key;
  const [discardedKey] = useState(() => (marked && !restoreOnMount ? key : null));
  const discarded = marked && key === discardedKey;
  const open = marked && !discarded;
  const scroll = useRef<{ element: HTMLElement | null; top: number }>(undefined);
  // One history step at a time: a second tap before the first lands would add or remove another entry.
  const moving = useRef(false);
  useEffect(() => {
    moving.current = false;
  }, [marked]);
  useEffect(() => {
    if (!discarded) return;
    // A reload can keep the history entry after its content has been cleared. Skip that step.
    const timer = window.setTimeout(() => {
      const current = router.history.location.state;
      if ((current.__TSR_key ?? current.key) !== key || current.sheet !== name) return;
      if (router.history.canGoBack()) {
        router.history.back();
      } else {
        void router.navigate({
          to: ".",
          search: true,
          params: true,
          state: (state) => ({ ...state, sheet: undefined }),
          replace: true,
          resetScroll: false,
        });
      }
    });
    return () => window.clearTimeout(timer);
  }, [discarded, key, name, router]);
  useEffect(
    () =>
      router.subscribe("onRendered", ({ fromLocation, toLocation }) => {
        if (
          scroll.current !== undefined &&
          fromLocation?.state.sheet === name &&
          toLocation.state.sheet !== name &&
          fromLocation.pathname === toLocation.pathname
        ) {
          const { element, top } = scroll.current;
          if (element) element.scrollTop = top;
          else window.scrollTo(0, top);
        }
      }),
    [router, name],
  );
  function show() {
    if (marked || moving.current) return;
    moving.current = true;
    const element = scrollElement?.() ?? null;
    scroll.current = { element, top: element?.scrollTop ?? window.scrollY };
    void router.navigate({
      to: ".",
      search: true,
      params: true,
      state: (state) => ({ ...state, sheet: name }),
      resetScroll: false,
    });
  }
  function hide() {
    if (!open || moving.current) return;
    moving.current = true;
    router.history.back();
  }
  return { open, show, hide };
}
