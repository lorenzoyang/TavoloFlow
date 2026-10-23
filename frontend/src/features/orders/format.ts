import { priceText } from "@/features/menu/api";
import type { Language } from "@/features/menu/language";

export const money = (amount: number, language: Language) =>
  `€ ${language === "it" ? priceText(amount).replace(".", ",") : priceText(amount)}`;
