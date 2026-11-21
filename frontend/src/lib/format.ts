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

// "2.5 km", from metres; Italian uses a decimal comma.
export function formatKm(meters: number, language: Language = "zh"): string {
  const km = String(Math.round(meters / 100) / 10);
  return `${language === "it" ? km.replace(".", ",") : km} km`;
}

// Locales for dates and times. English uses the British day/month order of the restaurant's region.
const locales: Record<Language, string> = { zh: "zh-CN", it: "it-IT", en: "en-GB" };

export function formatDateTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  return new Date(value).toLocaleString(locales[language], { timeZone });
}

export function formatPickupDateTime(value: string, language: Language) {
  return new Date(value).toLocaleString(locales[language], {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// "19:05" in the restaurant's time zone, for compact rows where the date is implied.
export function formatTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  return new Date(value).toLocaleTimeString(locales[language], {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

const weekday = (value: string | number, language: Language, timeZone: string) =>
  new Date(value).toLocaleDateString(locales[language], { timeZone, weekday: "short" });

// "Wed 12:00" in the restaurant's time zone, for moments within the coming week.
export function formatWeekdayTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  return `${weekday(value, language, timeZone)} ${formatTime(value, language, timeZone)}`;
}

// A moment that ends something (a slot of opening hours, a pause): midnight is the end of the day
// before, so it reads 24:00, as the hours editor writes it, never as a 00:00 already past.
export function formatClosingTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  const time = formatTime(value, language, timeZone);
  return time === "00:00" ? "24:00" : time;
}

// "Wed 24:00" rather than "Thu 00:00" for an end at midnight.
export function formatWeekdayClosingTime(
  value: string | number,
  language: Language = "zh",
  timeZone = RESTAURANT_TIME_ZONE,
) {
  const time = formatClosingTime(value, language, timeZone);
  const day = time === "24:00" ? new Date(value).getTime() - 60_000 : value;
  return `${weekday(day, language, timeZone)} ${time}`;
}

// A short reference people can read out. Server IDs are UUIDv7, whose leading digits are a timestamp
// shared by records created within the same minute, so the reference uses the random tail instead.
export function shortId(id: string) {
  return id.replaceAll("-", "").slice(-6).toUpperCase();
}
