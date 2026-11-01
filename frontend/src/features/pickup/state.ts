// The weekly hours as the server stores them: minutes since local midnight, closing exclusive, at most 24:00.
export type PickupHour = {
  weekday: number;
  slot: number;
  opensMinute: number;
  closesMinute: number;
};
// The hours form: one row per weekday (Monday is 1), each with up to two windows of "HH:MM" inputs.
export type HourDraft = { weekday: number; slots: { opens: string; closes: string }[] };
export type HoursProblem = "format" | "order" | "overlap";

// A cached pending list can outlive a request when a poll fails. Expired cards never ring or authorize
// another decision; the server's PickupState remains the authority when a write reaches it.
export const waitingPickups = <T extends { expiresAt: string }>(items: readonly T[], now: number) =>
  items.filter((item) => Date.parse(item.expiresAt) > now);

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const pad = (value: number) => String(value).padStart(2, "0");

// The value a time input holds. 24:00 cannot be typed there, so a window until midnight shows as 00:00.
export function inputTime(minutes: number): string {
  const value = minutes % 1440;
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

// How a window reads on the page: 24:00 stays 24:00.
export function windowText(hour: Pick<PickupHour, "opensMinute" | "closesMinute">): string {
  const end = hour.closesMinute === 1440 ? "24:00" : inputTime(hour.closesMinute);
  return `${inputTime(hour.opensMinute)}–${end}`;
}

// A time input's value in minutes; a closing time of 00:00 means midnight at the end of the day.
export function parseTime(text: string, closing: boolean): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return closing && minutes === 0 ? 1440 : minutes;
}

export function hoursDraft(hours: readonly PickupHour[]): HourDraft[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    slots: hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.slot - b.slot)
      .map((h) => ({ opens: inputTime(h.opensMinute), closes: inputTime(h.closesMinute) })),
  }));
}

// The week to save, or the first day with a problem. The server applies the same rules again.
export function draftHours(
  days: readonly HourDraft[],
): { hours: PickupHour[] } | { problem: HoursProblem; weekday: number } {
  const hours: PickupHour[] = [];
  for (const day of days) {
    let previousClose = -1;
    for (const [index, slot] of day.slots.slice(0, 2).entries()) {
      const opensMinute = parseTime(slot.opens, false);
      const closesMinute = parseTime(slot.closes, true);
      if (opensMinute === null || closesMinute === null)
        return { problem: "format", weekday: day.weekday };
      if (opensMinute >= closesMinute) return { problem: "order", weekday: day.weekday };
      if (opensMinute < previousClose) return { problem: "overlap", weekday: day.weekday };
      previousClose = closesMinute;
      hours.push({ weekday: day.weekday, slot: index + 1, opensMinute, closesMinute });
    }
  }
  return { hours };
}
