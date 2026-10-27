// Restaurant colour presets, chosen by the platform. Names describe the colour, not a cuisine: the hint
// only suggests a fit. Each non-default theme is a [data-theme] block in index.css.
export const THEMES = ["TERRACOTTA", "LACQUER", "INDIGO", "INK", "TARO"] as const;
export type RestaurantTheme = (typeof THEMES)[number];
export const DEFAULT_THEME: RestaurantTheme = "TERRACOTTA";

export const themeLabels: Record<RestaurantTheme, { name: string; hint: string }> = {
  TERRACOTTA: { name: "赤陶", hint: "默认 · 意式、综合" },
  LACQUER: { name: "朱漆", hint: "中餐" },
  INDIGO: { name: "靛蓝", hint: "日料、海鲜" },
  INK: { name: "墨黑", hint: "拉面、居酒屋" },
  TARO: { name: "芋泥紫", hint: "奶茶、甜品" },
};

export function isTheme(value: unknown): value is RestaurantTheme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

// The data-theme value for a restaurant, or null for the default and for unknown values, which keep
// the :root palette.
export function themeAttribute(value: unknown): string | null {
  return isTheme(value) && value !== DEFAULT_THEME ? value.toLowerCase() : null;
}
