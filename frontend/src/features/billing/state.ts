import { isUuid } from "../../lib/ids.ts";

// EMPTY is dine-in only and NO_SHOW (a pickup nobody collected) pickup only.
export type CloseKind = "PAID" | "EMPTY" | "VOIDED" | "NO_SHOW";
const closeKinds: readonly string[] = ["PAID", "EMPTY", "VOIDED", "NO_SHOW"];
export const isCloseKind = (value: unknown): value is CloseKind =>
  typeof value === "string" && closeKinds.includes(value);
export type Channel = "DINE_IN" | "PICKUP";
export type BillSummary = {
  sessionId: string;
  channel: Channel;
  // Table and label are NULL, and pickup is set, for pickup visits.
  tableId: string | null;
  tableLabel: string | null;
  pickup: {
    number: number;
    customerName: string;
    customerPhone: string;
    estimatedReadyAt: string;
  } | null;
  status: "ACTIVE" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  closeReason: CloseKind | null;
  billVersion: number;
  orderCount: number;
  itemCount: number;
  newItemCount: number;
  cancelledItemCount: number;
  totalAmountCents: number;
};
export type Confirmation = { kind: CloseKind; bill: BillSummary };
export type PendingClosure = { sessionId: string; kind: CloseKind };
export const closureKey = (restaurantId: string, userId: string) =>
  `tavoloflow:billing:${restaurantId}:${userId}`;
export const closeBadges = {
  PAID: "success",
  EMPTY: "outline",
  VOIDED: "outline",
  NO_SHOW: "outline",
} as const;

// The closures this bill allows now, in display order. A pickup with money due offers both "picked up"
// (PAID) and "not collected" (NO_SHOW); both are OWNER's, like every closure that records an amount.
export function closureKinds(bill: BillSummary, role: "OWNER" | "STAFF"): CloseKind[] {
  if (bill.status !== "ACTIVE" || bill.newItemCount > 0) return [];
  if (bill.orderCount === 0 && bill.totalAmountCents === 0)
    return bill.channel === "DINE_IN" ? ["EMPTY"] : [];
  if (
    bill.orderCount > 0 &&
    bill.itemCount > 0 &&
    bill.cancelledItemCount === bill.itemCount &&
    bill.totalAmountCents === 0
  )
    return ["VOIDED"];
  if (role !== "OWNER" || bill.totalAmountCents <= 0) return [];
  return bill.channel === "PICKUP" ? ["PAID", "NO_SHOW"] : ["PAID"];
}

export function confirmationChanged(confirmation: Confirmation, bill: BillSummary) {
  const previous = confirmation.bill;
  return (
    previous.sessionId !== bill.sessionId ||
    bill.status !== "ACTIVE" ||
    previous.billVersion !== bill.billVersion ||
    previous.totalAmountCents !== bill.totalAmountCents ||
    previous.newItemCount !== bill.newItemCount ||
    previous.orderCount !== bill.orderCount ||
    previous.itemCount !== bill.itemCount ||
    previous.cancelledItemCount !== bill.cancelledItemCount
  );
}

export function readClosures(raw: string | null): PendingClosure[] {
  try {
    const rows: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(rows)) return [];
    const result: PendingClosure[] = [];
    for (const row of rows) {
      if (
        row &&
        isUuid(row.sessionId) &&
        isCloseKind(row.kind) &&
        !result.some((x) => x.sessionId === row.sessionId)
      )
        result.push({ sessionId: row.sessionId, kind: row.kind });
    }
    return result;
  } catch {
    return [];
  }
}

export function closureRequest(confirmation: Confirmation) {
  const { bill, kind } = confirmation;
  const confirmed = {
    expectedBillVersion: bill.billVersion,
    confirmedTotalCents: bill.totalAmountCents,
  };
  if (kind === "PAID")
    return { path: `/api/owner/sessions/${bill.sessionId}/checkout`, body: confirmed };
  if (kind === "NO_SHOW")
    return {
      path: `/api/owner/sessions/${bill.sessionId}/close-no-show`,
      body: { ...confirmed, noShowConfirmed: true },
    };
  return {
    path: `/api/staff/sessions/${bill.sessionId}/${kind === "EMPTY" ? "close-empty" : "close-void"}`,
    body: { ...confirmed, guestsLeftConfirmed: true },
  };
}

// Recovery has no write body: the only possible automatic operation is a read of the original visit.
export const recoveryPath = (action: PendingClosure) => `/api/staff/sessions/${action.sessionId}`;
export const canAcceptResult = (
  mounted: boolean,
  started: number,
  current: number,
  aborted: boolean,
  sameIdentity: boolean,
) => mounted && started === current && !aborted && sameIdentity;

export type HistoryFilters = {
  fromDate?: string;
  toDate?: string;
  tableLabel?: string;
  closeReason?: CloseKind;
  channel?: Channel;
};
type BillingSearch = { sessionId?: string };
export type HistorySearch = BillingSearch & HistoryFilters;
export function billingSearch(search: Record<string, unknown>): BillingSearch {
  return { sessionId: isUuid(search.sessionId) ? search.sessionId : undefined };
}
export function historySearch(search: Record<string, unknown>): HistorySearch {
  const date = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  return {
    ...billingSearch(search),
    fromDate: date(search.fromDate),
    toDate: date(search.toDate),
    tableLabel:
      typeof search.tableLabel === "string"
        ? search.tableLabel.trim().slice(0, 50) || undefined
        : undefined,
    closeReason: isCloseKind(search.closeReason) ? search.closeReason : undefined,
    channel:
      search.channel === "DINE_IN" || search.channel === "PICKUP" ? search.channel : undefined,
  };
}
