import { isUuid } from "../../lib/ids.ts";

export type CloseKind = "PAID" | "EMPTY" | "VOIDED";
export type BillSummary = {
  sessionId: string;
  tableId: string | null;
  tableLabel: string;
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
export const closeBadges = { PAID: "success", EMPTY: "outline", VOIDED: "outline" } as const;

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
        (row.kind === "PAID" || row.kind === "EMPTY" || row.kind === "VOIDED") &&
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
  return {
    path:
      kind === "PAID"
        ? `/api/owner/sessions/${bill.sessionId}/checkout`
        : `/api/staff/sessions/${bill.sessionId}/${kind === "EMPTY" ? "close-empty" : "close-void"}`,
    body: {
      expectedBillVersion: bill.billVersion,
      confirmedTotalCents: bill.totalAmountCents,
      ...(kind === "PAID" ? {} : { guestsLeftConfirmed: true }),
    },
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
};
export type BillingSearch = { sessionId?: string };
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
    closeReason:
      search.closeReason === "PAID" ||
      search.closeReason === "EMPTY" ||
      search.closeReason === "VOIDED"
        ? search.closeReason
        : undefined,
  };
}
