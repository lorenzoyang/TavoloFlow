import { isUuid } from "../../lib/ids.ts";
import type { OnlineTicket, SessionNaming } from "../../lib/session-label.ts";

export type CloseKind = "PAID" | "EMPTY" | "VOIDED" | "NO_SHOW";
// TableId and tableLabel belong to dine-in; online carries the accepted order's ticket and phone.
export type BillSummary = SessionNaming & {
  sessionId: string;
  tableId: string | null;
  online:
    | (OnlineTicket & {
        customerPhone: string | null;
        deliveryAddress: string | null;
        deliveryNotes: string | null;
      })
    | null;
  status: "ACTIVE" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  closeReason: CloseKind | null;
  // Delivery only; the total includes it while any dish is not cancelled.
  deliveryFeeCents: number | null;
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
const closeKinds: readonly unknown[] = ["PAID", "EMPTY", "VOIDED", "NO_SHOW"];
const isCloseKind = (value: unknown): value is CloseKind => closeKinds.includes(value);

export function closureKind(bill: BillSummary, role: "OWNER" | "STAFF"): CloseKind | null {
  if (bill.status !== "ACTIVE" || bill.newItemCount > 0) return null;
  if (bill.orderCount === 0 && bill.totalAmountCents === 0) return "EMPTY";
  if (
    bill.orderCount > 0 &&
    bill.itemCount > 0 &&
    bill.cancelledItemCount === bill.itemCount &&
    bill.totalAmountCents === 0
  )
    return "VOIDED";
  return role === "OWNER" && bill.totalAmountCents > 0 ? "PAID" : null;
}

// The owner's second choice for an online order that would be paid: the customer never collected it.
// The server records the uncollected amount, with the same conditions as PAID.
export function noShowAllowed(bill: BillSummary, role: "OWNER" | "STAFF") {
  return bill.channel !== "DINE_IN" && closureKind(bill, role) === "PAID";
}

// A delivery bill's two parts: the dishes and the fee, which stops counting once every dish is
// cancelled (the server's SessionSummaries rule). Null fee for every other channel.
export function billAmounts(
  bill: Pick<
    BillSummary,
    "deliveryFeeCents" | "itemCount" | "cancelledItemCount" | "totalAmountCents"
  >,
) {
  const fee = bill.deliveryFeeCents;
  const feeCounted = fee !== null && bill.cancelledItemCount < bill.itemCount;
  return { fee, feeCounted, items: bill.totalAmountCents - (feeCounted ? fee : 0) };
}

// OWNER corrects an active delivery's fee before closing it.
export const canEditDeliveryFee = (bill: BillSummary, role: "OWNER" | "STAFF") =>
  role === "OWNER" && bill.status === "ACTIVE" && bill.channel === "DELIVERY";

// What the bill would ask for with another fee.
export function totalWithFee(bill: BillSummary, fee: number) {
  const { items } = billAmounts(bill);
  return bill.cancelledItemCount < bill.itemCount ? items + fee : 0;
}

// The fee write carries the bill version it was read at; that version is its only duplicate guard, so
// nothing is persisted and an unknown result is checked by rereading the bill.
export function deliveryFeeRequest(bill: BillSummary, deliveryFeeCents: number) {
  return {
    path: `/api/owner/sessions/${bill.sessionId}/delivery-fee`,
    body: { expectedBillVersion: bill.billVersion, deliveryFeeCents },
  };
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
  const path = {
    PAID: `/api/owner/sessions/${bill.sessionId}/checkout`,
    NO_SHOW: `/api/owner/sessions/${bill.sessionId}/close-no-show`,
    EMPTY: `/api/staff/sessions/${bill.sessionId}/close-empty`,
    VOIDED: `/api/staff/sessions/${bill.sessionId}/close-void`,
  }[kind];
  const confirmed =
    kind === "PAID"
      ? {}
      : kind === "NO_SHOW"
        ? { noShowConfirmed: true }
        : { guestsLeftConfirmed: true };
  return {
    path,
    body: {
      expectedBillVersion: bill.billVersion,
      confirmedTotalCents: bill.totalAmountCents,
      ...confirmed,
    },
  };
}

// Recovery has no write body: the only possible automatic operation is a read of the original visit.
export const recoveryPath = (action: PendingClosure) => `/api/staff/sessions/${action.sessionId}`;

export type HistoryFilters = {
  fromDate?: string;
  toDate?: string;
  tableLabel?: string;
  closeReason?: CloseKind;
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
  };
}
