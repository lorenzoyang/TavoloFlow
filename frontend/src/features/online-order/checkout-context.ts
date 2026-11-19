import { createContext, useContext } from "react";
import type { Language } from "@/lib/language";
import type { OnlineMenu } from "./api";
import type { useOnlineCart } from "./useOnlineCart";

// The menu page keeps the cart and the checkout form, so the checkout page (a child route) and the menu
// share one model and the form survives going back and forth.
export type OnlineCheckoutContextValue = {
  cart: ReturnType<typeof useOnlineCart>;
  data: OnlineMenu;
  slug: string;
  language: Language;
  selectLanguage: (value: Language) => void;
  // Back to the menu; the cart opens again unless the customer goes to add dishes.
  leave: (openCart: boolean) => void;
};

export const OnlineCheckoutContext = createContext<OnlineCheckoutContextValue | null>(null);

export const useOnlineCheckout = () => useContext(OnlineCheckoutContext);
