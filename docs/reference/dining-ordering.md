# Dining, guest access and ordering

Staff use `/staff/floor` to open visits and toggle new ordering. Guests use the fixed table entrance
`/q/{token}` to browse, join and order. OWNER and STAFF may open visits and close qualifying zero bills;
payment confirmation is OWNER-only. All closures are specified in [billing](billing-history.md).

## Visit identity and entrance rules

| Value        | Purpose                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| QR token     | Stable public table entrance; no order-reading or submission permission     |
| Session ID   | One visit, with a new ID for each opening; CLOSED never reopens             |
| Join code    | Four shared characters for joining a visit when required; encrypted at rest |
| Guest cookie | Protected grant bound to restaurant, table and visit; contains no code      |

Codes use secure random characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. The server trims and
uppercases input. Purpose-bound Data Protection includes restaurant, table and session identity;
moving ciphertext between visits does not work. Undecryptable ciphertext gives
`503 JOIN_CODE_UNAVAILABLE`, not a silently regenerated code. The UI preserves raw input while typing
to avoid disrupting IME composition; normalization happens on the server.

Only the platform controls `joinCodeRequired`, default true. Opening always generates/encrypts a code,
but responds with null and hides it on Floor when codes are disabled. Re-enabling codes therefore works
for already open visits and preserves existing grants. The switch is read under restaurant SHARE;
platform updates wait for in-flight joins.

Without codes, an unverified guest page attempts automatic joining once per visit and mounted page.
After failure or later grant invalidation it offers a join button, avoiding tabs at different tables
continually replacing the same cookie. A refused join rereads bootstrap in case codes were enabled.
The normal request omits the code. Code-free joining ignores the supplied value within the DTO's
32-character input limit; code format and matching are checked only when the restaurant requires it.
The Session ID, JSON shape, entrance checks and rate limits still apply in either mode.

| State change                        | Opening / guest joining / guest code read | Existing guest order reads / staff work                                  |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Ordering paused                     | Allowed                                   | Allowed; new submissions refused                                         |
| Service suspended or table disabled | Refused                                   | Existing valid grants may read orders; staff may finish work/close bills |
| Visit CLOSED                        | Refused for that visit                    | Guest protected reads/writes refused; staff may reconcile its summary    |

Anonymous menu browsing stays available through pauses. Staff code reading needs an ACTIVE visit but
is not blocked by service/table pauses. One browser has one Guest cookie; joining a second visit
replaces it. BroadcastChannel asks other tabs to recheck access without broadcasting codes/tickets.
Each protected operation checks live database binding/state; a remaining cookie is not proof of access.

## Floor and guest APIs

Store endpoints require the first password change and trusted restaurant identity. Guest endpoints use
the independent Guest cookie. Writes use the matching CSRF scope; JSON DTOs reject unknown fields.
All responses here are `Cache-Control: no-store`.

| Method and path                           | Input                                     | Success                                                                                        |
| ----------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/staff/floor`                    | Store cookie                              | `{ serviceStatus, orderingEnabled, joinCodeRequired, tables }`                                 |
| `POST /api/staff/tables/{tableId}/open`   | No business input                         | 201 `{ session, joinCode }`                                                                    |
| `GET /api/staff/sessions/{id}`            | Original visit ID                         | Shared bill summary, including CLOSED visits                                                   |
| `GET /api/staff/sessions/{id}/join-code`  | ACTIVE visit                              | `{ sessionId, joinCode }`                                                                      |
| `PATCH /api/staff/accepting-orders`       | `{ enabled }`                             | `{ orderingEnabled }`                                                                          |
| `GET /api/public/csrf`                    | Anonymous or Guest identity               | `{ token }`                                                                                    |
| `POST /api/public/qr/{token}/join`        | `{ sessionId, joinCode? }`                | Cookie and `{ restaurantId, tableId, sessionId }`                                              |
| `GET /api/public/sessions/{id}/access`    | Bound Guest cookie                        | `{ restaurantId, tableId, sessionId, status, serviceStatus, isTableEnabled, orderingEnabled }` |
| `GET /api/public/sessions/{id}/join-code` | Bound Guest cookie and available entrance | `{ sessionId, joinCode }`                                                                      |

Each Floor table is `{ id, tableLabel, isEnabled, session }`. Its nullable session is
`{ id, openedAt, orderCount, newItemCount, totalAmountCents }`. This small nested `id` differs from
the shared bill summary's `sessionId`. Opening returns that full summary under `session` and a nullable
`joinCode`. Summary fields and closure inputs are defined in [billing](billing-history.md#bill-responses).
Floor entrance data, tables and aggregates come from one Repeatable Read snapshot.

Joining returns no code. Guest cookies are HttpOnly, Path `/api/public`, fixed 12-hour session tickets
without sliding renewal. Identity selection, CSRF scope and production cookie policy are shared with
[accounts](accounts-platform.md#identity-and-security). Anonymous bootstrap still omits credentials;
guest reads/writes never trigger store logout handling.

Join limits default to 60 attempts/IP/minute and 30/session/five minutes under `GuestRateLimits`.
Successful and failed attempts count. These are in-memory, single-instance limits with no queue;
restarts reset them. Multi-instance deployments need a shared or edge limiting design.

## Order APIs and snapshots

| Method and path                                               | Input                                 | Success                                                         |
| ------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `POST /api/public/orders`                                     | Saved intent below, Guest cookie/CSRF | 201 for a new order, 200 for an existing request ID             |
| `GET /api/public/sessions/{id}/orders`                        | `cursor`, `limit` default 50/max 100  | `{ items, nextCursor, totalAmountCents }`                       |
| `GET /api/public/sessions/{id}/orders/by-request/{requestId}` | Original visit and UUID               | Original order, or 404 `ORDER_NOT_FOUND` if not currently found |

```json
{
  "sessionId": "00000000-0000-4000-8000-000000000001",
  "clientRequestId": "00000000-0000-4000-8000-000000000002",
  "items": [
    {
      "menuItemId": "00000000-0000-4000-8000-000000000003",
      "quantity": 2,
      "remark": "Less salt",
      "expectedUnitPriceCents": 1400,
      "optionIds": ["00000000-0000-4000-8000-000000000004"]
    }
  ]
}
```

Use actual resource IDs. Orders have no whole-order remark. `optionIds` lists the chosen
[options](menu-tables.md#option-groups) (required; at most 50, distinct; empty for none) and
`expectedUnitPriceCents` is the dish price plus their deltas. Response fields are `id`, `sessionId`,
`status`, `createdAt`, `defaultLanguage`, `totalAmountCents`, `payableAmountCents` and `items`.
Each item contains `id`, nullable `menuItemId`, `itemCode`, three names, `allergenCodes`,
`unitPriceCents`, `quantity`, nullable `remark`, `options`, `status`, `readyAt` and `cancelledAt`.
Each option is the snapshot `groupNameZh/It/En`, `nameZh/It/En` and `priceDeltaCents`, in display
order (group order, then option order).
Client request IDs, tickets, codes and serving timestamps are not returned in this order DTO.

Original order totals and names/codes/allergens/prices/options remain immutable snapshots.
`unitPriceCents` already includes the option deltas, so every bill sum stays
`unitPriceCents × quantity`; `allergenCodes` is the dish's codes plus the chosen options', in
canonical order. Options are stored as the `order_items.options_snapshot` JSON array, never as links. Payable amount is
the sum of uncancelled lines. The list total covers the entire visit's uncancelled items, not just its
page. Orders sort by `(createdAt, id)` descending; the cursor binds the session. Guest reads require
an ACTIVE bound visit, even when ordering/service/table availability is paused.

`409 MENU_CHANGED` includes `changes` with `menuItemId`, `reason`, `currentUnitPriceCents` and
`isAvailable`. Reasons are MISSING, UNAVAILABLE, OPTIONS_CHANGED and PRICE_CHANGED. OPTIONS_CHANGED
means the choice no longer fits the dish's current groups: an option is gone, sold out or from a group
the dish doesn't use, or a group's count is outside its minimum/maximum. PRICE_CHANGED compares the
dish price plus deltas and returns that current unit price. Refresh the menu and require another
confirmation; do not silently remove lines or submit at a new price. A first definitively refused
intent may unlock; an already unknown intent follows the stricter recovery rule below.

## Transaction and lock boundaries

| Operation                                   | Locks, in order                                                  |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Open visit                                  | Restaurant SHARE → table UPDATE; check no ACTIVE visit, insert   |
| Join / guest code read                      | Restaurant SHARE → table SHARE → session SHARE                   |
| Create order                                | Restaurant SHARE → table SHARE → session UPDATE                  |
| Read guest orders / staff code              | Session SHARE                                                    |
| Kitchen transition / served write / closure | Session UPDATE                                                   |
| Set accepting orders                        | Restaurant UPDATE; enabling additionally requires ACTIVE service |

Every new visit starts at bill version 1. Never acquire restaurant/table locks after locking a session.
`RowLocks` runs inside a transaction
owned by its caller; catalog deletion services own their own transactions. The active-visit unique
index is the final opening safeguard.

Order creation first validates the request envelope, identity binding and ACTIVE visit, then looks up
the original `(session_id, client_request_id)`. If it exists, return it before first-submission input,
service, price and availability gates. JSON parsing, identity and CSRF still have to pass. A duplicate
with different business content cannot create a second order. Closed visits do not permit recovery.

For a first submission, restaurant SHARE coordinates with menu writers' UPDATE and table SHARE with
enablement changes. The server validates quantities, allergens/review, availability and current prices,
resolves each line's options against the dish's groups (`OrderOptions.Resolve`), then saves the
entire order and snapshots and increments `BillVersion` once in the same transaction. Option groups
are menu data, so the same restaurant SHARE lock keeps them stable.
The session lock serializes same-visit submission, cancellation and closure; different visits can
proceed in parallel. Reads hold session SHARE without subsequently locking the entrance.

Limits: 1–30 lines, 1–20 portions per line, at most 100 portions, 200 characters per line remark.
Remarks are trimmed; blank becomes null. Check each line, order and accumulated payable bill against
`9,007,199,254,740,991` cents and prevent bill-version overflow. First submission and cancellation can
return `BILL_LIMIT_REACHED`; an existing intent still recovers before first-submission amount checks.

## Frontend state and unknown results

Carts use tab-local sessionStorage keyed by `tavoloflow:cart:{restaurantId}:{tableId}` and retain
the observed visit (null before opening). Same item, same options and trimmed remark merge;
differing options or remarks stay separate. Carts are version 2: each line keeps a snapshot of its
chosen options (id, group id, names, delta), refreshed with the dish before review; a choice that no
longer fits stops the review (`CartError("options")`) and the line asks to be removed and added
again. Option rules shared by the picker and the cart live in the node-tested
`features/orders/options.ts`. The first opened visit requires explicit confirmation. An old visit's
draft never moves to a new visit. UUIDv4 generation uses secure `getRandomValues`, including HTTP
LAN environments.

Before POST, save and read back the complete intent. Storage failure allows editing but blocks
submission; pending intents freeze edits. Server order responses are not persisted locally.

| Situation                                 | Required recovery                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Submission succeeds or GET finds original | Validate original and payable totals, then clear matching intent/draft                     |
| Timeout, network/parse failure or 5xx     | Keep intent frozen; revalidate original access, then GET by original request ID            |
| Lookup is 404                             | Still unknown; continue checking or offer explicit original-request retry                  |
| Guest retries                             | Same ID/body, fresh CSRF; a rejection does not release a previously unknown intent         |
| First submission definitively rejected    | Keep draft, release that intent and ask for correction/reconfirmation                      |
| Authorization expires/is replaced         | Hide/remove protected responses, retain original intent; rejoin that visit before recovery |
| Visit closes/is replaced                  | Clear visit draft/protected state; direct an unknown result to staff                       |

There is no discard-and-use-a-new-ID button for an unknown order. A delayed original could still arrive.
Foreground checks run about every 30 seconds, with revalidation on reload/reconnect/resume. Guest query
keys include `guest`, restaurant, table and session, and survive unrelated store identity changes.

Floor writes have a 15-second timeout. Their markers contain `{ kind: "open", tableId }` for opening
or `{ kind: "accepting", enabled }` for the accepting-orders switch, under a storage key scoped to
restaurant and account. They contain no codes. After an unknown open, GET current Floor state: show an
existing visit for staff review or require fresh confirmation if empty. A delayed old open remains
possible because opening has no request-level idempotency key. Accepting-orders recovery also uses GET
and a new explicit action.
Closure markers store the original session ID separately; closure recovery always queries that visit,
as described in [billing](billing-history.md).

Guest join with an unknown result recovers through access GET; a received cookie can restore access.
The client does not automatically resubmit an unknown join. Bootstrap/access polling detects closure;
the page stores an ended marker and requires an explicit return to browsing before a new visit.
Codes live only in short-lived component memory and clear on hiding, offline state, access rechecks
and visit changes. Abort requests and discard late results on identity/lifecycle changes.

## Errors and verification

Important errors: `GUEST_AUTH_REQUIRED` and `JOIN_CODE_INCORRECT` (401), `GUEST_SESSION_MISMATCH` (403),
`QR_NOT_FOUND`, `TABLE_NOT_FOUND`, `SESSION_NOT_FOUND`, `ORDER_NOT_FOUND` (404), and
`SESSION_ALREADY_ACTIVE`, `SESSION_CLOSED`, `SERVICE_SUSPENDED`, `TABLE_DISABLED`, `ORDERING_PAUSED`,
`MENU_CHANGED` (reasons above), `BILL_LIMIT_REACHED` (409). `RATE_LIMITED` includes Retry-After. A mismatch never changes
the intended target or deletes another tab's valid guest cookie.

Sources: [DiningService](../../backend/TavoloFlow.Api/Dining/DiningService.cs),
[GuestService](../../backend/TavoloFlow.Api/Guests/GuestService.cs),
[OrderService](../../backend/TavoloFlow.Api/Ordering/OrderService.cs),
[order contracts](../../backend/TavoloFlow.Api/Ordering/OrderContracts.cs),
[cart hook](../../frontend/src/features/orders/useCart.ts).

Tests: [dining/guest integration](../../backend/TavoloFlow.Api.Tests/DiningAndGuestTests.cs),
[order integration](../../backend/TavoloFlow.Api.Tests/OrderTests.cs),
[guest state](../../frontend/tests/dining-guest.test.ts),
[cart/order recovery](../../frontend/tests/orders.test.ts).
Manually exercise concurrent duplicate intents, a price change after confirmation, lost successful
responses, blocked storage, cross-tab grant replacement, closure during recovery and all languages at
360px. Use an isolated test environment; do not replay sample orders against a live restaurant.
