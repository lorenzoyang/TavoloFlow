import { parsePrice } from "../../lib/format.ts";

export type SubscriptionSummary = {
  ownerContact: string | null;
  defaultAnnualFeeCents: number | null;
  version: number;
  serviceState: "UNCONFIGURED" | "UPCOMING" | "ACTIVE" | "EXPIRED";
  startsOn: string | null;
  expiresOn: string | null;
  paymentState: "UNPAID" | "PAID" | null;
  unpaidPeriodCount: number;
  dueSoon: boolean;
  localToday: string;
};
export type SubscriptionPeriod = {
  id: string;
  startsOn: string;
  endsOn: string;
  years: number;
  amountCents: number;
  paidOn: string | null;
  isPaid: boolean;
};
export type PeriodInput = Omit<SubscriptionPeriod, "isPaid">;
export type SubscriptionDetail = { summary: SubscriptionSummary; periods: SubscriptionPeriod[] };

// Calendar arithmetic avoids UTC conversion and clamps 29 February to 28 February.
export function addCalendarYears(value: string, years: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isSafeInteger(years) || years < 1) return null;
  const [year, month, day] = value.split("-").map(Number);
  const source = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 || source.toISOString().slice(0, 10) !== value || year + years > 9999) return null;
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${String(year + years).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function periodTotal(annualFee: number | null, years: number): number | null {
  if (
    annualFee === null ||
    !Number.isSafeInteger(annualFee) ||
    annualFee < 0 ||
    !Number.isSafeInteger(years) ||
    years < 1
  )
    return null;
  const total = BigInt(annualFee) * BigInt(years);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

// Throws on invalid input; callers show their own localized message.
export function periodFromForm(data: FormData, prefix: string, id: string): PeriodInput {
  const startsOn = String(data.get(`${prefix}-startsOn`) ?? "");
  const endsOn = String(data.get(`${prefix}-endsOn`) ?? "");
  const years = Number(data.get(`${prefix}-years`));
  const amountCents = parsePrice(String(data.get(`${prefix}-amount`) ?? ""));
  const paid = data.get(`${prefix}-paid`) === "on";
  const paidOn = paid ? String(data.get(`${prefix}-paidOn`) ?? "") : null;
  if (
    !addCalendarYears(startsOn, years) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) ||
    endsOn <= startsOn ||
    amountCents === null ||
    (paid && !paidOn)
  )
    throw new Error("Invalid period");
  return { id, startsOn, endsOn, years, amountCents, paidOn };
}

// A renewal starts where the latest agreement ends. Periods never overlap and arrive latest start
// first, so the first period also has the latest end date.
export function renewalStart(
  latest: SubscriptionPeriod | undefined,
  summary: Pick<SubscriptionSummary, "expiresOn" | "localToday">,
): string {
  return latest?.endsOn ?? summary.expiresOn ?? summary.localToday;
}
