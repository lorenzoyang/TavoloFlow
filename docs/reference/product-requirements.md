# Qiao TavoloFlow: product requirements

This document defines the current MVP's business scope and acceptance baseline.
Feature documents describe implementation contracts; migrations define the deployed schema.

## Product and audience

Qiao TavoloFlow is a dine-in QR ordering system for small restaurants.
Guests order from their phones, staff operate the floor and kitchen, and owners confirm offline payment.
The system supports multiple restaurants within one deployment.

The business application and API share one public HTTPS origin, for example `https://app.example.com`.
Other hosts, such as a marketing site on the parent domain, are not part of this application.
The technical project name, namespaces and internal identifiers remain TavoloFlow.

## Roles and permissions

| Role                   | Capabilities                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Guest                  | Browse without an account; join the current visit; order and view that table's submitted orders                                         |
| STAFF                  | Open visits, manage incoming work, mark dishes served, toggle availability/ordering, read active bills and close qualifying zero bills  |
| OWNER                  | All staff capabilities plus menu/table maintenance, payment confirmation, closed history, staff password reset and subscription reading |
| Platform administrator | Create/manage restaurants and store accounts, select themes/join-code policy, manage service periods and record fee collection          |

Each restaurant has at most one shared OWNER and one shared STAFF account.
Multiple devices may use the same account; individual employee/device sessions are not managed.
Platform identity grants no store-order, bill or join-code access.
Store and platform users can operate in Chinese, Italian or English.
Their language is a shared device preference; guests choose separately for each restaurant.

## End-to-end visit

### 1. Restaurant preparation

The platform creates a suspended restaurant with ordering off and both store accounts atomically.
Temporary passwords are shown only in the successful response.
The owner changes the initial password, prepares menu/allergens and creates tables with fixed QR codes.
The platform activates service; staff explicitly enable ordering.
Reactivating a restaurant never silently enables ordering.

### 2. Opening and guest access

Staff confirm the table and explicitly open a new visit.
A table has at most one ACTIVE visit; scanning its QR never opens one.
Every visit has a new identity and an encrypted four-character join code.
The platform may disable the requirement to enter that code for a restaurant.
In code-free mode the guest page attempts one automatic join per visit and page, then offers a button.
Re-enabling codes keeps already issued guest grants valid.

The QR is a public entrance, not an ordering credential.
Guests can browse before joining and while service or ordering is paused.
Successful joining issues a protected cookie bound to the restaurant, table and visit.
The browser can retain one guest visit identity at a time; joining another table replaces it.
Closing the visit invalidates its grants even if cookies remain in browsers.
A closed visit is never reopened.

### 3. Menu and cart

Guests can always choose Chinese, Italian or English.
Without an explicit guest choice, use the restaurant's default menu language.
Missing names follow a documented fallback; descriptions follow the resolved name's language.
Sold-out items remain visible but cannot be submitted.
Every item content save requires an explicit allergen review, including sold-out items.
An empty reviewed allergen list does not promise absence of cross-contact.

Carts are private to a browser tab and table, with the observed visit attached.
A draft made before opening requires explicit confirmation of its first visit.
Drafts from an ended visit never migrate into the next visit.
Limit one submission to 30 lines, 20 portions per line and 100 portions in total.
Each line may have a 200-character remark; there is no whole-order note.
Editing can continue with blocked storage, but submitting requires durable intent storage.

### 4. Submission and recovery

Guests confirm current items and prices before submitting.
Each new intent has one saved request ID and the full original body before POST.
The server validates current access, visit state, availability and prices for a first submission.
Changed prices or availability require another explicit confirmation.
An existing request ID returns its original order before first-submission business gates.
Creating an order and its immutable snapshots is atomic and changes the bill version once.

An unknown result is not a failed order.
Automatic recovery uses GET; manual retry resends the identical ID/body with fresh CSRF.
A lookup returning 404 does not prove that a delayed submission cannot still succeed.
An unknown intent remains frozen after a subsequent retry rejection.
After closure, guests stop recovery and ask staff to check the original visit.

### 5. Kitchen and delivery

Kitchen defaults to a dish grouping, with order and processed views also available.
Each device may hide menu categories for its station; new categories appear by default.
Staff process an entire line quantity from NEW to READY or CANCELLED.
Cancellation requires human confirmation, but no reason; READY cannot be cancelled.
When no lines remain NEW, the order becomes PROCESSED.
Cancellation removes the line from the payable amount while retaining its snapshots.

The pass screen lists READY dishes waiting for delivery in ACTIVE visits, grouped by visit.
Marking a line served records a separate timestamp; it changes neither status nor bill version.
There is no undo, partial quantity, served history or delivery confirmation dialog.
Kitchen/pass poll every 10 seconds while visible and online.
Stale or unsynchronized screens block writes; arrival sounds are subject to browser audio permissions.

### 6. Bills and closure

Staff can read the complete active bill; only the owner confirms offline collection.
The system records that confirmation and cannot verify the actual transfer of money.
The confirmation freezes the visit, bill version and amount; polling cannot silently replace them.
The server recomputes and compares the bill atomically before closing.

| Reason | Conditions                                                                                      | Role        |
| ------ | ----------------------------------------------------------------------------------------------- | ----------- |
| PAID   | Positive receivable, no NEW lines, matching version/amount, owner confirms collection           | OWNER       |
| EMPTY  | No orders ever placed, zero amount, matching version, guests confirmed gone                     | STAFF/OWNER |
| VOIDED | Existing orders with every line CANCELLED, zero amount, matching version, guests confirmed gone | STAFF/OWNER |

Closure stores the final amount/time/reason and clears the encrypted code atomically.
It also marks remaining unserved READY lines served; delivery is not a prerequisite for closing.
Identical repeated closure returns the stored result; conflicting closure cannot rewrite it.
Service/table/ordering pauses do not prevent finishing existing work or closing bills.
Owners can query closed visits by local dates, historical table label and closure reason.
Catalog deletion preserves closed history and order snapshots.

## Platform service and fees

Restaurant service status, ordering state and subscription status are separate concepts.
The platform records non-overlapping service periods and one full offline collection per period.
Payment never shifts agreed dates; renewals add periods.
Paid amounts/dates are frozen; expiry changes use a dedicated operation.
Expiry and unpaid reminders warn without automatically suspending service or disabling ordering.
Owners read only their own subscription; STAFF and guests receive no contact or fee information.
Permanent deletion requires a suspended restaurant and removes all its tenant data after confirmation.

## Correctness and security boundaries

- Backend identity determines tenant and role; browser UI and supplied resource IDs do not grant access.
- Database constraints and transactions protect tenant relationships, unique visits and unique intents.
- Each visit starts at bill version 1; new orders and successful cancellations increment it, not readiness, delivery or closure.
- Store/platform cookies last a fixed 30 days; guest tickets last 12 hours, without sliding renewal.
- Password changes/reset invalidate older account credentials; logout affects the current browser only.
- Controller writes require identity-scoped CSRF; automatic writes are never retried or queued offline.
- Production uses HTTPS, same-origin requests and persisted Data Protection keys outside Git.
- Passwords, tickets and join codes are excluded from logs and browser persistence.
- Menu edits may overwrite prior edits; ordering still checks server prices and availability.
- Opening has no request-level idempotency key: delayed requests remain an accepted operational risk.
- Explicit release migrations and restorable backups are required; API startup never migrates the schema.

## Out of scope

Online payments/refunds, fiscal receipts, order printers, stock, takeaway/delivery, reservations,
membership, all-you-can-eat rules, discounts, split bills and sales reports are outside this MVP.
There is no shared cart, WebSocket delivery, push notification or offline business operation queue.
There is no QR/code rotation, device-specific grant revocation, menu publishing workflow,
manual menu ordering or complete audit-event history.
The staff area is installable; guest and platform pages remain websites.

## Acceptance baseline

| Scenario                                     | Required outcome                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Two restaurants and different roles          | No cross-tenant access or privilege substitution                                      |
| Two devices open the same table              | At most one ACTIVE visit                                                              |
| Lost opening response                        | GET reconciliation and a fresh human decision; no automatic second POST               |
| Code-required and code-free visits           | Correct joining behavior, grant binding and closure invalidation                      |
| Concurrent replay of one order intent        | One order and one bill-version increment                                              |
| Price/availability changes before submission | Reject stale confirmation; retain the guest draft                                     |
| Lost order response, reload and retry        | Recover the original intent without switching ID or visit                             |
| READY versus cancellation race               | One legal transition, immutable snapshots, correct payable amount                     |
| Pass delivery and closure                    | Served state does not affect billing; closed work leaves the pass queue               |
| New order/cancellation versus checkout       | Reject stale bill confirmation or reject writes to a closed visit                     |
| EMPTY, VOIDED and PAID                       | Distinct conditions and permissions; repeated closure cannot rewrite history          |
| Deleted catalog rows                         | Historical names, prices, amounts and labels remain readable                          |
| Account reset and expired cookies            | Old credentials rejected without disturbing unrelated identities                      |
| Subscription edits and lost responses        | Version-protected changes, read-only recovery, reminders without automatic suspension |

Use real PostgreSQL integration tests for constraints and locking, pure frontend tests for recovery
logic, and manual browser checks for the complete guest/staff flow. See the [documentation index](../README.md).
