# Billing and closed history

OWNER confirms offline collection in `/staff/orders` or the selected Floor visit. STAFF can read an
active bill on Floor and close qualifying EMPTY/VOIDED visits. Closed history at `/staff/history` is
OWNER-only. The system records confirmation of offline payment, not a payment transaction.

## APIs and permissions

Store endpoints use trusted restaurant identity, require the first password change and return
`Cache-Control: no-store`. Writes need Store CSRF; request DTOs reject unknown fields.

| Method and path                             | Role        | Input / success                                                 |
| ------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `GET /api/staff/sessions/{id}/bill`         | STAFF/OWNER | Active bill; cursor, limit default 50/max 100                   |
| `POST /api/owner/sessions/{id}/checkout`    | OWNER       | `{ expectedBillVersion, confirmedTotalCents }` → closed summary |
| `POST /api/staff/sessions/{id}/close-empty` | STAFF/OWNER | Zero-bill input → closed summary                                |
| `POST /api/staff/sessions/{id}/close-void`  | STAFF/OWNER | Zero-bill input → closed summary                                |
| `GET /api/owner/history`                    | OWNER       | Resolved filters and paged closed summaries                     |
| `GET /api/owner/history/{id}`               | OWNER       | Closed bill; cursor, limit default 50/max 100                   |
| `GET /api/staff/sessions/{id}`              | STAFF/OWNER | Summary of the original active/closed visit for recovery        |

Zero-bill input is `{ expectedBillVersion, confirmedTotalCents: 0, guestsLeftConfirmed: true }`.
Closing succeeds with 200 and the shared summary. It never returns codes, credentials or client request
IDs. Platform identity cannot perform these operations.

## Bill responses

A bill is `{ summary, orders, nextCursor }`. The shared summary has:

```text
sessionId, tableId, tableLabel, status, openedAt, closedAt, closeReason,
billVersion, orderCount, itemCount, newItemCount, cancelledItemCount, totalAmountCents
```

`tableId`, `closedAt` and `closeReason` may be null as appropriate. Item counts count lines, not
portions. Active totals sum uncancelled unit-price × quantity across the entire visit; closed totals
come from stored `closed_total_cents`. Neither is a page subtotal.

Orders reuse the [kitchen DTO](kitchen-pass.md#kitchen-apis-and-transactions): original amount,
remaining payable amount, status and immutable line snapshots with READY/cancellation timestamps.
Cancelled lines retain original prices and content and are shown as excluded from receivables.
There is no cancellation reason or whole-order note.

Bill paging is over **orders**, ascending `(createdAt, id)`, including all lines for each loaded order.
Cursors bind restaurant, visit, active/history mode and bill version. An old active-bill cursor after a
version change returns `409 BILL_CHANGED`; reset to page one. READY does not change that version, so
polling refreshes all loaded pages to obtain state updates. One response holds session SHARE while
reading totals/counts/orders, but multiple page requests are not one frozen database snapshot.

## Closure conditions and transaction

| Reason | Preconditions                                                                                           | Actor       |
| ------ | ------------------------------------------------------------------------------------------------------- | ----------- |
| PAID   | Positive receivable, no NEW lines, matching version/amount, confirmed offline collection                | OWNER       |
| EMPTY  | No orders of any status, zero amount, matching version and guests-left confirmation                     | STAFF/OWNER |
| VOIDED | At least one order and every line CANCELLED, zero amount, matching version and guests-left confirmation | STAFF/OWNER |

A zero amount alone is insufficient for VOIDED. A visit that ever received an order cannot use EMPTY.
The owner confirms money received outside the app; no payment provider verifies it.

All reasons share `BillingService.CloseAsync`:

1. Start a transaction and lock only the target session UPDATE. Never acquire restaurant/table locks
   afterwards. Ordering, kitchen changes and delivery use the same session lock.
2. Read current bill state under that lock. If already closed, return its stored summary only for the
   identical reason/version/amount; otherwise reject with `SESSION_CLOSED`.
3. Compare version and amount and enforce the reason's conditions. A stale confirmation returns
   `BILL_CHANGED`; NEW lines return `ORDERS_PENDING`. Zero PAID returns `SESSION_NOT_PAYABLE`; invalid
   VOIDED returns `SESSION_NOT_VOIDABLE`; EMPTY with orders returns `SESSION_HAS_ORDERS`. Closure
   conflicts include `currentBill` for reconfirmation.
4. Atomically store CLOSED, reason, final amount/time and null code ciphertext. Do not increment
   BillVersion or modify order snapshots.
5. Stamp still-unserved READY lines served in the same transaction and commit. Existing serving times
   are preserved. Closure does not require staff to tap every delivery first.

Closing time is clamped to visit opening, the latest order `processedAt ?? createdAt`, and the latest
already recorded `servedAt` in this restaurant and visit. These reads share the existing session lock;
they acquire no restaurant/table row locks. Staff do not have to mark delivery before checkout. READY
lines still lacking a serving time are automatically stamped at closure (defensively clamped to ready
time); already served lines keep their original times. This prevents clock rollback from placing
closure before a recorded delivery. Existing closed history is not backfilled.

A new order/cancellation committed first invalidates the old confirmation; closure committed first
rejects later writes. Any intermediate failure rolls back the entire closure and delivery stamping.
Service suspension, disabled tables and paused ordering do not block closure. Closed visits never
reopen, and guest access is rejected through the existing live visit checks.

## Confirmation and unknown results

The selected session ID stays in URL search on Bill and Floor. OWNER-only pages check role before
mounting restricted queries. Activity polling runs every 30 seconds while visible/online, refreshing
on resume, reconnect and relevant writes. Failed, stale (30 seconds) or not-yet-synchronized-after-resume
bills cannot close. Routine initial/resume synchronization only warns after a three-second grace;
offline/errors warn immediately. This grace does not permit writes.

Entering confirmation copies the displayed summary. Later polling cannot replace that snapshot. A
changed version, amount, order count or relevant state invalidates it. POST uses exactly the version
and amount the human saw; a preliminary GET is not a substitute for the server transaction.

Before writing, persist minimal `{ sessionId, kind }` per tab/restaurant/account. Never persist the
bill body, code or credentials. If storage fails, retain in-memory recovery and warn the operator to
record the visit ID before refreshing. Timeout, network failure and 5xx mean an unknown result.

| Original-session recovery result | UI behavior                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CLOSED                           | Show actual reason/amount and ask staff to reconcile collection; do not attribute the closure to this attempt |
| ACTIVE                           | Reload bill and require a new human confirmation                                                              |
| Missing/inaccessible             | Stop automatic checking and request manual review; never target the table's next visit                        |
| GET fails                        | Retain marker and keep recovery read-only                                                                     |

Pending recovery blocks another closure of that visit. Recovery is always GET, never automatic POST.
Late requests cannot close the next visit because identity and confirmation bind the original session.
Lifecycle/identity changes cancel old work and discard responses. Successful closure invalidates Floor,
session, table, bill, kitchen and history data. The separate pass screen refreshes on its next poll/resume. Guest polling discovers closure and clears its own visit
state and protected responses.

## History filters

Parameters: `fromDate`, `toDate` (`YYYY-MM-DD`), `tableLabel`, `closeReason`, cursor and limit. Omit both
dates to use the restaurant's local today from TimeProvider; explicit dates must be paired. Both dates
are inclusive for the operator, converted to UTC `[local start midnight, day after end midnight)`.
DST transitions can therefore produce 23- or 25-hour days.

Response: `{ items, nextCursor, totalCount, fromDate, toDate, timeZone }`. Order is `(closedAt, id)`
descending, default 50/max 100. Cursors retain resolved date bounds across midnight and bind restaurant,
historical table label and closure reason. Labels match trimmed, case-sensitive snapshots exactly.
PAID, EMPTY and VOIDED are all queryable. Detail lookup by session ID is independent of list filters.

Catalog deletion detaches nullable references, preserving original labels/names/prices and final totals.
There is no routine reopen/edit/delete-history business endpoint. Platform deletion of an entire
suspended restaurant is a separate explicitly destructive operation.

## Verification entry points

Sources: [BillingController](../../backend/TavoloFlow.Api/Controllers/BillingController.cs),
[BillingService](../../backend/TavoloFlow.Api/Billing/BillingService.cs),
[summary projection](../../backend/TavoloFlow.Api/Dining/SessionSummaries.cs),
[bill hook](../../frontend/src/features/billing/useBill.ts),
[closure hook](../../frontend/src/features/billing/useClosure.ts),
[pending markers](../../frontend/src/lib/usePendingMarkers.ts).

Tests: [billing integration](../../backend/TavoloFlow.Api.Tests/BillingTests.cs) and
[frontend confirmation/recovery](../../frontend/tests/billing.test.ts).
Manual checks: NEW blocks checkout; a concurrent addition invalidates a frozen amount; distinct zero
closures; lost checkout response followed by GET-only recovery; guest invalidation; multi-page bills;
DST/history filters; catalog deletion preserving snapshots; two owners confirming the same closure.
Use an isolated database. These are verification scenarios, not a current-version execution record.
