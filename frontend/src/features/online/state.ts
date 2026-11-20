// Pure online ordering rules, node-tested. They repeat the server's rules so forms can explain a
// mistake before sending; the server stays the authority.
import { formatCents, parsePrice } from "../../lib/format.ts";

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

// Gives other weekdays the same slots as one day, replacing theirs; the owner still saves the week.
export function copyDay(week: WeekDraft, from: number, to: readonly number[]): WeekDraft {
  const copy = { ...week };
  for (const day of to)
    if (day !== from) copy[day] = (week[from] ?? []).map((slot) => ({ ...slot }));
  return copy;
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

// Delivery settings, saved together: the restaurant's coordinates, the fee bands, an optional minimum
// order, an optional note per language and the switch, which needs the coordinates and a band.
// Blank notes are stored as null, like the server; each note takes at most 500 characters once
// trimmed. The minimum is a positive decimal amount, blank for none.
export const MAX_DELIVERY_NOTE_LENGTH = 500;
export const MAX_DELIVERY_TIERS = 5;
export const MAX_DELIVERY_METERS = 30_000;
// One fee band by road distance from the restaurant, nearest first; 0 cents is free delivery.
export type DeliveryTier = {
  maxMeters: number;
  feeCents: number;
  freeDeliveryMinCents: number | null;
};
export const deliveryFeeForTier = (tier: DeliveryTier, discountedItemsCents: number) =>
  tier.freeDeliveryMinCents != null && discountedItemsCents >= tier.freeDeliveryMinCents
    ? 0
    : tier.feeCents;

export const freeDeliveryShortfall = (tier: DeliveryTier, discountedItemsCents: number) =>
  tier.feeCents > 0 && tier.freeDeliveryMinCents != null
    ? Math.max(0, tier.freeDeliveryMinCents - discountedItemsCents)
    : 0;
export type Coordinates = { lat: number; lng: number };
export type DeliveryNotes = { zh: string; it: string; en: string };
export type TierDraft = { km: string; fee: string; freeDeliveryMinCents: number | null };
export type DeliveryDraft = {
  origin: string;
  tiers: TierDraft[];
  minOrder: string;
  notes: DeliveryNotes;
  enabled: boolean;
};
export type DeliverySettings = {
  deliveryEnabled: boolean;
  deliveryNoteZh: string | null;
  deliveryNoteIt: string | null;
  deliveryNoteEn: string | null;
  deliveryMinOrderCents: number | null;
  deliveryOriginLat: number | null;
  deliveryOriginLng: number | null;
  deliveryTiers: DeliveryTier[];
  // Whether this server prices delivery automatically (a Geoapify key is set): checkout then shows
  // the fee for the customer's address.
  deliveryAutoQuote: boolean;
};
export type DeliveryInput = {
  enabled: boolean;
  noteZh: string | null;
  noteIt: string | null;
  noteEn: string | null;
  minOrderCents: number | null;
  originLat: number | null;
  originLng: number | null;
  tiers: DeliveryTier[];
};
// The first field to fix, in the form's order; "setup" is the switch turned on without the
// coordinates or a band.
export type DeliveryProblem =
  | { field: "origin" }
  | { field: "tier"; index: number; part: "km" | "fee" | "repeated" }
  | { field: "minOrder" }
  | { field: "note"; language: keyof DeliveryNotes }
  | { field: "setup" };

// "43.880153, 11.096122", as Google Maps copies a point after a right click on a computer: decimal
// degrees with a point, latitude first, then a comma and the longitude. Rounded to six decimals like
// the server; null otherwise, such as a share link, which holds no coordinates.
export function parseOrigin(value: string): Coordinates | null {
  const match = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return null;
  const lat = Math.round(Number(match[1]) * 1e6) / 1e6;
  const lng = Math.round(Number(match[2]) * 1e6) / 1e6;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const formatOrigin = (lat: number | null, lng: number | null) =>
  lat === null || lng === null ? "" : `${lat}, ${lng}`;

// A pin on Google Maps, so the owner can check the pasted point is the restaurant.
export const originMapsUrl = ({ lat, lng }: Coordinates) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// Kilometres with at most one decimal, "2.5" or "2,5": the band's distance in metres, 0.1-30 km.
function parseKm(value: string): number | null {
  const match = /^(\d{1,2})(?:[.,](\d))?$/.exec(value.trim());
  if (!match) return null;
  const meters = Number(match[1]) * 1000 + Number(match[2] ?? 0) * 100;
  return meters >= 100 && meters <= MAX_DELIVERY_METERS ? meters : null;
}

export const emptyTierDraft: TierDraft = { km: "", fee: "", freeDeliveryMinCents: null };

export function deliveryTierRanges(tiers: TierDraft[]) {
  const ordered = tiers
    .map((tier, index) => ({ index, maxMeters: parseKm(tier.km) ?? 0 }))
    .sort((a, b) => a.maxMeters - b.maxMeters);
  if (ordered.some((tier, index) => tier.maxMeters === (ordered[index - 1]?.maxMeters ?? 0)))
    return null;
  return ordered.map((tier, index) => ({
    ...tier,
    minMeters: ordered[index - 1]?.maxMeters ?? 0,
  }));
}

export function applyFreeDeliveryMinimum(
  tiers: TierDraft[],
  original: number | null,
  selected: number[],
  minimum: number | null,
) {
  return tiers.map((tier, index) => ({
    ...tier,
    freeDeliveryMinCents: selected.includes(index)
      ? minimum
      : tier.freeDeliveryMinCents === original
        ? null
        : tier.freeDeliveryMinCents,
  }));
}

export function deliveryDraft(settings: DeliverySettings): DeliveryDraft {
  return {
    origin: formatOrigin(settings.deliveryOriginLat, settings.deliveryOriginLng),
    tiers: settings.deliveryTiers.map((tier) => ({
      km: String(tier.maxMeters / 1000),
      fee: formatCents(tier.feeCents),
      freeDeliveryMinCents: tier.freeDeliveryMinCents ?? null,
    })),
    minOrder:
      settings.deliveryMinOrderCents === null ? "" : formatCents(settings.deliveryMinOrderCents),
    notes: {
      zh: settings.deliveryNoteZh ?? "",
      it: settings.deliveryNoteIt ?? "",
      en: settings.deliveryNoteEn ?? "",
    },
    enabled: settings.deliveryEnabled,
  };
}

const note = (value: string) => value.trim() || null;

// The server's rules: both coordinates or neither; up to five bands at distinct distances (any
// order, saved nearest first) with a fee of 0 or more; delivery on needs the coordinates and a band.
export function deliveryInput(
  draft: DeliveryDraft,
): { ok: true; input: DeliveryInput } | { ok: false; problem: DeliveryProblem } {
  const origin = parseOrigin(draft.origin);
  if (draft.origin.trim() !== "" && origin === null)
    return { ok: false, problem: { field: "origin" } };
  const tiers: DeliveryTier[] = [];
  for (const [index, tier] of draft.tiers.entries()) {
    const maxMeters = parseKm(tier.km);
    if (maxMeters === null) return { ok: false, problem: { field: "tier", index, part: "km" } };
    if (tiers.some((other) => other.maxMeters === maxMeters))
      return { ok: false, problem: { field: "tier", index, part: "repeated" } };
    const feeCents = parsePrice(tier.fee, true);
    if (feeCents === null) return { ok: false, problem: { field: "tier", index, part: "fee" } };
    tiers.push({ maxMeters, feeCents, freeDeliveryMinCents: tier.freeDeliveryMinCents ?? null });
  }
  const minOrder = draft.minOrder.trim();
  const minOrderCents = minOrder === "" ? null : parsePrice(minOrder);
  if (minOrder !== "" && minOrderCents === null)
    return { ok: false, problem: { field: "minOrder" } };
  for (const language of ["zh", "it", "en"] as const)
    if ((note(draft.notes[language])?.length ?? 0) > MAX_DELIVERY_NOTE_LENGTH)
      return { ok: false, problem: { field: "note", language } };
  if (draft.enabled && (origin === null || tiers.length === 0))
    return { ok: false, problem: { field: "setup" } };
  return {
    ok: true,
    input: {
      enabled: draft.enabled,
      noteZh: note(draft.notes.zh),
      noteIt: note(draft.notes.it),
      noteEn: note(draft.notes.en),
      minOrderCents,
      originLat: origin?.lat ?? null,
      originLng: origin?.lng ?? null,
      tiers: tiers.sort((a, b) => a.maxMeters - b.maxMeters),
    },
  };
}

export const sameDelivery = (input: DeliveryInput, settings: DeliverySettings) =>
  input.enabled === settings.deliveryEnabled &&
  input.noteZh === settings.deliveryNoteZh &&
  input.noteIt === settings.deliveryNoteIt &&
  input.noteEn === settings.deliveryNoteEn &&
  input.minOrderCents === settings.deliveryMinOrderCents &&
  input.originLat === settings.deliveryOriginLat &&
  input.originLng === settings.deliveryOriginLng &&
  input.tiers.length === settings.deliveryTiers.length &&
  input.tiers.every(
    (tier, index) =>
      tier.maxMeters === settings.deliveryTiers[index].maxMeters &&
      tier.feeCents === settings.deliveryTiers[index].feeCents &&
      tier.freeDeliveryMinCents === (settings.deliveryTiers[index].freeDeliveryMinCents ?? null),
  );

// Coupons: a code customers type, a whole percentage off the dishes and an optional last local day. The
// server's rules (OnlineCoupons): 3-20 letters or digits, stored uppercase; 1-50 percent.
export const COUPON_MIN_PERCENT = 1;
export const COUPON_MAX_PERCENT = 50;
export type OnlineCoupon = {
  id: string;
  code: string;
  percentOff: number;
  // yyyy-mm-dd, inclusive; null never expires.
  validUntil: string | null;
  expired: boolean;
};
export type CouponDraft = { code: string; percent: string; validUntil: string };
export type CouponInput = { code: string; percentOff: number; validUntil: string | null };
export type CouponProblem = "code" | "percent" | "date";
export const emptyCouponDraft: CouponDraft = { code: "", percent: "", validUntil: "" };

// Trimmed and uppercased like the server; null when it cannot be a code.
export function normalizeCouponCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{3,20}$/.test(code) ? code : null;
}

export const validCouponPercent = (value: number) =>
  Number.isInteger(value) && value >= COUPON_MIN_PERCENT && value <= COUPON_MAX_PERCENT;

// An incomplete native date input also has an empty value; badInput keeps it apart from an intentional
// blank. The server checks the last day against the restaurant's local today.
export function couponInput(
  draft: CouponDraft,
  dateBadInput = false,
): { ok: true; input: CouponInput } | { ok: false; problems: CouponProblem[] } {
  const code = normalizeCouponCode(draft.code);
  const percent = /^\d{1,2}$/.test(draft.percent.trim()) ? Number(draft.percent.trim()) : NaN;
  const problems: CouponProblem[] = [
    ...(code === null ? (["code"] as const) : []),
    ...(validCouponPercent(percent) ? [] : (["percent"] as const)),
    ...(dateBadInput ? (["date"] as const) : []),
  ];
  if (problems.length || code === null) return { ok: false, problems };
  return {
    ok: true,
    input: { code, percentOff: percent, validUntil: draft.validUntil || null },
  };
}

// The submission cap (OnlineAvailability): with this many requests waiting, customers cannot order.
export const MAX_WAITING_REQUESTS = 20;

// The estimated-time choices for accepting an order, in minutes: ready to collect, or delivered.
export const PICKUP_MINUTES = [10, 20, 30, 45] as const;
export const DELIVERY_MINUTES = [30, 45, 60, 90] as const;

// Optional reasons staff give for rejecting; OUT_OF_RANGE is for delivery only.
export type RejectReason = "SOLD_OUT" | "BUSY" | "CLOSING" | "OUT_OF_RANGE";
export const rejectReasons = (fulfillment: "PICKUP" | "DELIVERY"): RejectReason[] =>
  fulfillment === "DELIVERY"
    ? ["SOLD_OUT", "BUSY", "CLOSING", "OUT_OF_RANGE"]
    : ["SOLD_OUT", "BUSY", "CLOSING"];

// The delivery fee the OWNER types when correcting a bill, in cents: a decimal amount, 0 when free,
// and with the items still a safe integer like every bill. Null while it is not a valid fee.
export function typedDeliveryFee(value: string, itemsTotalCents: number): number | null {
  const fee = parsePrice(value, true);
  return fee !== null && fee <= Number.MAX_SAFE_INTEGER - itemsTotalCents ? fee : null;
}

// A plain Google Maps search link for a delivery address; nothing is sent until someone opens it.
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// The driving route from the restaurant to the customer's address as typed, so whoever accepts reads
// the road distance and picks the fee band; again nothing is sent until someone opens it.
export const routeUrl = ({ lat, lng }: Coordinates, address: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(address)}&travelmode=driving`;

// The banner above every staff page: nothing at zero, the count while customers can still order, and
// a warning once the cap stops new orders.
export function pendingBanner(count: number) {
  if (count <= 0) return null;
  return { full: count >= MAX_WAITING_REQUESTS, count };
}

// Waited and remaining time of a request on the server's clock. The list carries the server's now,
// received at receivedAt on this device; the device clock only measures time since then.
export function requestTimes(
  request: { submittedAt: string; expiresAt: string },
  serverNow: string,
  receivedAt: number,
  now: number,
) {
  const at = Date.parse(serverNow) + Math.max(0, now - receivedAt);
  return {
    waitedMinutes: Math.max(0, Math.floor((at - Date.parse(request.submittedAt)) / 60_000)),
    remainingSeconds: Math.max(0, Math.ceil((Date.parse(request.expiresAt) - at) / 1000)),
  };
}

// "7:05": minutes and seconds left before a request expires.
export function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// An accepted order's progress: still cooking, ready (nothing waiting and something ready), or every
// dish cancelled.
export function activeProgress(order: { newItemCount: number; readyItemCount: number }) {
  if (order.newItemCount > 0) return "preparing" as const;
  return order.readyItemCount > 0 ? ("ready" as const) : ("cancelled" as const);
}
