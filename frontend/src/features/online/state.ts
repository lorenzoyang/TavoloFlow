// Pure online ordering rules, node-tested. They repeat the server's rules so forms can explain a
// mistake before sending; the server stays the authority.

export const MINUTES_PER_DAY = 1440;

// ISO weekday 1 (Monday) to 7 (Sunday), in the restaurant's local time.
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type OnlineHour = { weekday: number; opensMinute: number; closesMinute: number };

// Restaurant and customer phones: an optional + and 6-15 digits once whitespace is removed, the same
// rule as the server's InputRules.NormalizePhone. Returns the stored form, or null when invalid.
export function normalizePhone(value: string): string | null {
  const compact = value.replace(/\s/g, "");
  return /^\+?[0-9]{6,15}$/.test(compact) ? compact : null;
}

// "HH:MM" for display; a slot ending at midnight shows 24:00.
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// The value for <input type="time">, which cannot hold 24:00: midnight as a closing time is 00:00.
export const timeInputValue = (minute: number) => formatMinute(minute % MINUTES_PER_DAY);

// Parses an <input type="time"> value. As a closing time, 00:00 means midnight at the end of the day.
export function parseTime(value: string, closing: boolean): number | null {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return closing && minute === 0 ? MINUTES_PER_DAY : minute;
}

export type SlotDraft = { opens: string; closes: string };
export type WeekDraft = Record<number, SlotDraft[]>;

// One editable row list per weekday, from the saved hours.
export function weekDraft(hours: OnlineHour[]): WeekDraft {
  const week: WeekDraft = {};
  for (const day of WEEKDAYS)
    week[day] = hours
      .filter((hour) => hour.weekday === day)
      .sort((a, b) => a.opensMinute - b.opensMinute)
      .map((hour) => ({
        opens: timeInputValue(hour.opensMinute),
        closes: timeInputValue(hour.closesMinute),
      }));
  return week;
}

export type WeekProblem = "time" | "order" | "overlap" | "tooMany";
export type WeekResult =
  { ok: true; hours: OnlineHour[] } | { ok: false; weekday: number; problem: WeekProblem };

// The server's rules: each weekday has at most two slots, each opening before it closes and never
// crossing midnight, and the second starting no earlier than the first ends.
export function weekHours(week: WeekDraft): WeekResult {
  const hours: OnlineHour[] = [];
  for (const weekday of WEEKDAYS) {
    const drafts = week[weekday] ?? [];
    if (drafts.length > 2) return { ok: false, weekday, problem: "tooMany" };
    const day: OnlineHour[] = [];
    for (const draft of drafts) {
      const opensMinute = parseTime(draft.opens, false);
      const closesMinute = parseTime(draft.closes, true);
      if (opensMinute === null || closesMinute === null)
        return { ok: false, weekday, problem: "time" };
      if (opensMinute >= closesMinute) return { ok: false, weekday, problem: "order" };
      day.push({ weekday, opensMinute, closesMinute });
    }
    day.sort((a, b) => a.opensMinute - b.opensMinute);
    if (day.length === 2 && day[1].opensMinute < day[0].closesMinute)
      return { ok: false, weekday, problem: "overlap" };
    hours.push(...day);
  }
  return { ok: true, hours };
}

export function sameHours(a: OnlineHour[], b: OnlineHour[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (hour, index) =>
        hour.weekday === b[index].weekday &&
        hour.opensMinute === b[index].opensMinute &&
        hour.closesMinute === b[index].closesMinute,
    )
  );
}
