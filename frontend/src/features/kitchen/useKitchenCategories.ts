import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { menuQuery } from "@/features/menu/api";
import { categoryFilter, hiddenCategoriesKey, readHiddenCategories } from "./state";

export type KitchenCategories = ReturnType<typeof useKitchenCategories>;

// The menu categories this kitchen screen leaves out, so one tablet can serve one station. It is a
// device preference, like the sound: only the hidden IDs are stored, so new categories show everywhere.
export function useKitchenCategories(account: CurrentAccount, active: boolean) {
  const storageKey = hiddenCategoriesKey(account.restaurantId);
  const [hidden, setHiddenState] = useState(() => {
    try {
      return readHiddenCategories(localStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });
  const [choosing, setChoosing] = useState(false);

  // The menu maps dishes to categories. It is read only while this screen hides some or is choosing,
  // and refreshed slowly, because a kitchen tablet can stay in the foreground all day.
  const menu = useQuery({
    ...menuQuery(account),
    enabled: active && (hidden.length > 0 || choosing),
    refetchInterval: active && hidden.length > 0 ? 5 * 60_000 : false,
    refetchIntervalInBackground: false,
  });
  // Null while nothing is hidden or the menu has not loaded: every dish shows.
  const filter = useMemo(() => categoryFilter(menu.data?.items, hidden), [menu.data, hidden]);

  // Saved on every change, like the sound switch; without storage it still applies to this page.
  function setHidden(next: string[]) {
    setHiddenState(next);
    try {
      if (next.length) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      /* Kept for this page only. */
    }
  }

  return {
    hidden,
    setHidden,
    // Hidden categories still on the menu; a deleted one no longer counts.
    hiddenCount: menu.data
      ? menu.data.categories.filter((category) => hidden.includes(category.id)).length
      : hidden.length,
    choosing,
    setChoosing,
    menu,
    filter,
  };
}
