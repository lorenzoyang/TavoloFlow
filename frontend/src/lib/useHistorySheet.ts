import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

export type HistorySheet = "cart" | "options";

declare module "@tanstack/react-router" {
  interface HistoryState {
    // A customer page's open bottom sheet (useHistorySheet).
    sheet?: HistorySheet;
  }
}

// A customer page's bottom sheet (the cart, a dish's options) as a step in the browser history. Opening
// it adds an entry that only marks the sheet in its state, with the same URL, so the back gesture
// (Android's back button, an iPhone's edge swipe, an in-app browser's back arrow) closes the sheet
// instead of leaving the page, where a closed tab would lose the cart. Closing it from the page goes
// back over that entry. The router scrolls every history step to the top, so closing restores the
// scroll position the page had when the sheet opened.
export function useHistorySheet(name: HistorySheet) {
  const router = useRouter();
  const open = useLocation({ select: (location) => location.state.sheet === name });
  const scroll = useRef(0);
  // One history step at a time: a second tap before the first lands would add or remove another entry.
  const moving = useRef(false);
  useEffect(() => {
    moving.current = false;
  }, [open]);
  useEffect(
    () =>
      router.subscribe("onRendered", ({ fromLocation, toLocation }) => {
        if (
          fromLocation?.state.sheet === name &&
          toLocation.state.sheet !== name &&
          fromLocation.pathname === toLocation.pathname
        )
          window.scrollTo(0, scroll.current);
      }),
    [router, name],
  );
  function show() {
    if (open || moving.current) return;
    moving.current = true;
    scroll.current = window.scrollY;
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
