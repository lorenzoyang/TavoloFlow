import type { Language } from "./language.ts";

// Every restaurant currently uses Europe/Rome; the API sends UTC timestamps.
export const RESTAURANT_TIME_ZONE = "Europe/Rome";

// Parse base-10 digits as integers: never round a binary floating-point euro amount.
// Prices must be positive; allowZero admits amounts such as a waived annual fee.
export function parsePrice(value: string, allowZero = false): number | null {
  const match = /^(\d{1,14})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents >= (allowZero ? 0n : 1n) && cents <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(cents)
    : null;
}

// Integer cents as "12.50".
export function formatCents(cents: number): string {
  const amount = BigInt(cents);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

// "€ 12.50"; Italian uses a decimal comma.
export function formatMoney(cents: number, language: Language = "zh"): string {
  const amount = formatCents(cents);
  return `€ ${language === "it" ? amount.replace(".", ",") : amount}`;
}

export function formatDateTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  return new Date(value).toLocaleString(language === "zh" ? "zh-CN" : language, { timeZone });
}

// "19:05" in the restaurant's time zone, for compact rows where the date is implied.
export function formatTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  return new Date(value).toLocaleTimeString(language === "zh" ? "zh-CN" : language, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// A short reference people can read out. Server IDs are UUIDv7, whose leading digits are a timestamp
// shared by records created within the same minute, so the reference uses the random tail instead.
export function shortId(id: string) {
  return id.replaceAll("-", "").slice(-6).toUpperCase();
}
