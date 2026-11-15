import { useState } from "react";
import type { Language } from "@/lib/language";
import { readLanguage, saveLanguage, selectedLanguage } from "@/features/public-menu/language";

// localStorage itself can throw (blocked site data); every caller copes with null.
export function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The customer's language for one restaurant, shared with its QR menu: an explicit choice is
// remembered on the device, otherwise the owner's default applies.
export function useRestaurantLanguage(restaurantId: string, fallback: Language) {
  const [preference, setPreference] = useState<Language | null>(() => {
    const storage = deviceStorage();
    return storage ? readLanguage(restaurantId, storage) : null;
  });
  const language = selectedLanguage(preference, fallback);
  function select(value: Language) {
    setPreference(value);
    const storage = deviceStorage();
    if (storage) saveLanguage(restaurantId, value, storage);
  }
  return [language, select] as const;
}
