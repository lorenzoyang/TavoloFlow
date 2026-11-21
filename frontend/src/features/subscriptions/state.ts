import { parsePrice } from "../../lib/format.ts";

export type SubscriptionSummary = {
  ownerContact: string | null;
  defaultMonthlyFeeCents: number | null;
  version: number;
  serviceState: "UNCONFIGURED" | "UPCOMING" | "ACTIVE" | "EXPIRED";
  startsOn: string | null;
  expiresOn: string | null;
  paymentState: "UNPAID" | "PAID" | null;
  unpaidPeriodCount: number;
  dueSoon: boolean;
  renewalExpired: boolean;
  renewal: { deadline: string; stage: "DUE_SOON" | "EXPIRED"; awaitingPayment: boolean } | null;
  localToday: string;
};
export type SubscriptionPeriod = {
  id: string;
  startsOn: string;
  endsOn: string;
  months: number;
  monthlyFeeCents: number;
  amountCents: number;
  paidOn: string | null;
  isPaid: boolean;
};
export type PeriodInput = Pick<
  SubscriptionPeriod,
  "id" | "startsOn" | "months" | "monthlyFeeCents" | "paidOn"
> & {
  reason: string | null;
};
export type SubscriptionDetail = { summary: SubscriptionSummary; periods: SubscriptionPeriod[] };
export type SubscriptionNotice = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  kind: "REGISTERED" | "CHANGED" | "PAID" | "DUE_SOON" | "EXPIRED";
  change: { before: SubscriptionPeriod | null; after: SubscriptionPeriod } | null;
  reason: string | null;
  deadline: string | null;
  awaitingPayment: boolean;
  periodPaid: boolean | null;
};

// Use UTC fields for calendar arithmetic, without using the device's offset.
export function addCalendarMonths(value: string, months: number): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value <= "0001-01-01" ||
    !Number.isSafeInteger(months) ||
    months < 1 ||
    months > 119987
  )
    return null;
  const source = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(source.getTime()) || source.toISOString().slice(0, 10) !== value)
    return null;
  const lastDay = new Date(source);
  lastDay.setUTCMonth(source.getUTCMonth() + months + 1, 0);
  if (lastDay.getUTCFullYear() > 9999) return null;
  lastDay.setUTCDate(Math.min(source.getUTCDate(), lastDay.getUTCDate()));
  return lastDay.toISOString().slice(0, 10);
}

export function periodTotal(monthlyFee: number | null, months: number): number | null {
  if (
    monthlyFee === null ||
    !Number.isSafeInteger(monthlyFee) ||
    monthlyFee < 1 ||
    !Number.isSafeInteger(months) ||
    months < 1
  )
    return null;
  const total = BigInt(monthlyFee) * BigInt(months);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export function periodFromForm(data: FormData, prefix: string, id: string): PeriodInput {
  const startsOn = String(data.get(`${prefix}-startsOn`) ?? "");
  const months = Number(data.get(`${prefix}-months`));
  const monthlyFeeCents = parsePrice(String(data.get(`${prefix}-monthly-fee`) ?? ""));
  const paid = data.get(`${prefix}-paid`) === "on";
  const paidOn = paid ? String(data.get(`${prefix}-paidOn`) ?? "") : null;
  const reason = String(data.get(`${prefix}-reason`) ?? "").trim() || null;

  if (
    !addCalendarMonths(startsOn, months) ||
    monthlyFeeCents === null ||
    periodTotal(monthlyFeeCents, months) === null ||
    (paid && !paidOn)
  ) {
    throw new Error("Invalid period");
  }
  return { id, startsOn, months, monthlyFeeCents, paidOn, reason };
}

// A renewal starts where the latest agreement ends. Periods never overlap and arrive latest start
// first, so the first period also has the latest end date.
export function renewalStart(
  latest: SubscriptionPeriod | undefined,
  summary: Pick<SubscriptionSummary, "expiresOn" | "localToday">,
): string {
  return latest?.endsOn ?? summary.expiresOn ?? summary.localToday;
}
