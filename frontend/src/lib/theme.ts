// Restaurant colour presets, chosen by the platform. Each non-default theme is a [data-theme] block in
// index.css. Their names (the colour, not a cuisine) and hints live in features/platform/messages.ts.
export const THEMES = ["TERRACOTTA", "LACQUER", "INDIGO", "INK", "TARO"] as const;
export type RestaurantTheme = (typeof THEMES)[number];
export const DEFAULT_THEME: RestaurantTheme = "TERRACOTTA";

export function isTheme(value: unknown): value is RestaurantTheme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

// The data-theme value for a restaurant, or null for the default and for unknown values, which keep
// the :root palette.
export function themeAttribute(value: unknown): string | null {
  return isTheme(value) && value !== DEFAULT_THEME ? value.toLowerCase() : null;
}
