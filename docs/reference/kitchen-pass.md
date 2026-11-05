# Kitchen and pass

OWNER and STAFF use `/staff/kitchen` to process order lines and `/staff/pass` to deliver ready dishes.
Both use store authentication, first-password-change enforcement and trusted restaurant identity.
Writes require Store CSRF. Paused service, tables or ordering do not block existing kitchen/pass work.

## States and views

Each line is NEW, READY or CANCELLED. The only kitchen transitions are NEW → READY and NEW → CANCELLED,
for the entire quantity on that line. Neither role can cancel READY, undo a terminal state or process
a partial quantity. Cancellation requires human confirmation of table, dish, quantity and removed
amount, with a prompt to check with the kitchen; no reason is stored.

An order remains NEW while any line is NEW, then becomes PROCESSED. `processedAt` is the latest terminal
line timestamp. Original snapshots, quantities and order total never change; payable amount excludes
CANCELLED lines. Actual cancellation increments the visit's bill version once; READY does not.

| Kitchen view    | Content                                            | Ordering                             |
| --------------- | -------------------------------------------------- | ------------------------------------ |
| Dishes, default | NEW lines grouped from loaded NEW orders           | Oldest order `(createdAt, id)` first |
| Orders          | NEW orders, including their terminal lines         | `(createdAt, id)` ascending          |
| Processed       | PROCESSED orders, including fully cancelled orders | `(processedAt, id)` descending       |

Dishes and Orders share one NEW query. Dish grouping is client-side by `menuItemId`, or snapshot code
and names after deletion. Remarks stay on their own lines. A group shows its oldest name, total
portions and longest wait; each line still invokes the individual endpoint. There is no batch write.
Kitchen cards omit allergen details; the guest's special requests remain in remarks.

While any line is NEW, terminal lines remain compactly in original position. The last NEW transition
moves the order to Processed, where full details remain visible. There is no separate cancelled tab or
whole-order action. Kitchen requests 100 orders per page; if more remain, Dishes warns that totals are
incomplete and offers load-more.

### Category screens

Each device can hide categories in the Dishes view. The dialog positively selects shown categories,
requiring at least one when categories exist. Only hidden IDs are stored under
`tavoloflow:kitchen-hidden-categories:{restaurantId}` in localStorage, so newly added categories show
everywhere. This preference survives logout and has no API field or station entity.

The menu is fetched only while categories are hidden or being chosen; while hidden it refreshes every
five minutes. Missing/deleted dishes and a menu not yet loaded show on every screen. After a failed
refresh with cached data, current code retains the previous category mapping; a no-data failure shows
all dishes and a warning. Retaining cached filtering without a new cached-refresh warning is the
accepted policy. Category moves take effect at the next successful menu read. Orders and Processed
remain unfiltered.

## Kitchen APIs and transactions

| Method and path                                     | Input                                                                      | Success                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/staff/orders`                             | `status=NEW` or `status=PROCESSED` (default NEW), cursor, limit 50/max 100 | `{ items, nextCursor, totalCount, pendingCount, latestCreatedAt }` |
| `GET /api/staff/orders/{id}`                        | Original order ID                                                          | Complete current kitchen order                                     |
| `POST /api/staff/orders/{id}/items/{itemId}/ready`  | No business fields                                                         | Complete order after NEW → READY                                   |
| `POST /api/staff/orders/{id}/items/{itemId}/cancel` | No business fields                                                         | Complete order after NEW → CANCELLED                               |

Kitchen order fields: `id`, `sessionId`, `tableLabel`, `status`, `createdAt`, `processedAt`,
`defaultLanguage`, `totalAmountCents`, `payableAmountCents` and the shared
[order line DTO](dining-ordering.md#order-apis-and-snapshots). Responses contain no cancellation reason,
client request ID, code or credentials. All responses are `no-store`.

Lists contain only ACTIVE visits. Rows/counts come from one Repeatable Read snapshot. `totalCount`
counts orders in the chosen status; `pendingCount` counts all active NEW orders. Cursors bind tenant,
status and position. `latestCreatedAt` is the maximum creation timestamp across both statuses and
closed visits, read through an index maximum for each status, not a count of historical orders.
Processing and closure do not move that maximum. It is a timestamp, not a cumulative order counter.

Single-order reads hold session SHARE and reject a closed visit. Writes first resolve restaurant/
order/item binding, then take only session UPDATE. They never subsequently lock restaurant or table.
Reread state, conditionally update `status = 'NEW'`, increment bill version for cancellation, and
maintain order status/processed time in the same transaction. Line event time is clamped to order
creation; summary processed time is the maximum terminal time across its lines.

Wrong-tenant, missing or misbound write targets give `404 ORDER_ITEM_NOT_FOUND`; order GET uses
`ORDER_NOT_FOUND`. Duplicates, READY cancellation and races give `409 ORDER_ITEM_CHANGED`. Closed visits
give `SESSION_CLOSED`. A cancelling bill version at its limit gives `BILL_LIMIT_REACHED`.

## Pass APIs and delivery

The pass lists READY lines with null `servedAt` in ACTIVE visits, grouped by visit in the UI. Visits
sort by their earliest waiting line, and lines by ready time/ID. Waits of at least five minutes receive
a warning color without changing order. The entry is on Home for OWNER and STAFF, outside primary tabs.

| Method and path                                     | Input                                  | Success                                            |
| --------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `GET /api/staff/pass`                               | cursor, limit 50/max 100 (UI uses 100) | `{ items, nextCursor, totalCount, latestReadyAt }` |
| `POST /api/staff/orders/{id}/items/{itemId}/served` | No business fields                     | The updated pass item                              |

Pass items contain `id`, `orderId`, `sessionId`, `tableLabel`, `defaultLanguage`, `itemCode`, three names,
`quantity`, `remark`, `readyAt` and nullable `servedAt`. They contain no prices or request IDs.
The list uses ascending `(readyAt, id)` keyset paging with tenant-bound cursors. Rows, count and
watermark come from one Repeatable Read snapshot. `latestReadyAt` is the restaurant-wide maximum ready
time of waiting READY lines; closure stamping keeps closed work out of that partial waiting index.

Served writes resolve tenant/order/line, acquire only session UPDATE and conditionally set the time
where `status = 'READY' AND served_at IS NULL`. Time is at least `readyAt`. This changes neither order
status, processed time, bill version nor cancellation eligibility. Repeats/races return
`ORDER_ITEM_CHANGED`, misbound targets `ORDER_ITEM_NOT_FOUND`, closed visits `SESSION_CLOSED`.
There is no SERVED enum state, undo, confirmation dialog or served history.

Closure does not require delivered dishes. In the same closure transaction, remaining unserved READY
lines are stamped served at closing time, clamped to ready time; previously served timestamps remain.
This also removes the visit's unserved work from the waiting index. See [billing](billing-history.md).

## Synchronization, recovery and sound

Both screens poll every 10 seconds only while visible and online and refresh loaded pages. A failed,
offline, 30-second-old or not-yet-refreshed-after-resume view blocks writes. A three-second grace delays
routine synchronization warnings, not write gating; failures/offline status warn immediately.

Kitchen persists minimal `{ orderId, sessionId, itemId, kind }` markers per tab/restaurant/account before
writing; one pending action blocks its order. The marker appears only once the result is unknown.
Recovery GETs the original order and target line. A terminal state is reported as observed, without
overwriting it. A still-NEW target releases the marker for a fresh human action; cancellation confirms
again. Legacy whole-order markers use null itemId and permit GET-only review. There is no automatic POST.

Pass deliberately persists no marker: the refreshed waiting list reconciles an unknown write. If the
line remains, staff can explicitly tap again; the conditional endpoint prevents a second state change.
Kitchen writes invalidate kitchen, pass, Floor, dining and bill queries. Served writes refresh the pass
list itself. Old responses
are cancelled/discarded after hiding, disconnecting or changing identity; kitchen confirmation closes.

Sound is enabled by default, but playback depends on browser permissions and AudioContext state.
Page taps try to unlock audio; the UI requests a tap when necessary. Kitchen plays two rising tones;
pass plays three short high tones through shared `useAlertSound`/`AlertAudio`. Sound and wake-lock
settings are device preferences, not business state.

First load, foreground resume and reconnect establish silent baselines. Kitchen views share a
restaurant-wide order watermark. Category-filtered screens compare their visible NEW line IDs only
while all NEW orders are loaded and the menu is available; otherwise they fall back to the global
timestamp. Pass compares its waiting-ready watermark. Only a strict increase during continuous polling
chimes; serving/closing can lower it silently. These are auxiliary foreground reminders, not durable
event delivery. Clock rollback or transactions committing out of timestamp order can add work without
advancing the maximum, so a new item can appear without an additional chime.

For a counter tablet, install the [staff PWA](pwa.md), open Pass, enable keep-screen-on and set system
volume. Optional OS Guided Access/screen pinning can restrict navigation; the application itself has
no screen lock. Relaunch starts at Home (`/staff`), then staff choose Pass again.

## Migration compatibility and verification

- `ItemLevelOrderProcessing` maps legacy NEW/READY/CANCELLED orders to item states and NEW/PROCESSED
  summaries, preserving snapshots/totals and compatible timestamps. These are historical order event
  times, not proof of individual dish preparation times. Its Down rejects incompatible downgrades.
- `RemoveOrderCancelReason` drops old reason text; Down cannot restore it.
- `AddOrderItemServedAt` stamps pre-existing READY lines served at ready time, preventing an initial
  backlog on introduction of Pass. `MarkServedAtClosure` stamps older closed visits' remaining work.
  The latter is data-only and cannot undo its stamps on Down.
- Deploy schema/API/frontend together using explicit migration bundles and refresh old pages after
  incompatible changes. Use a pre-upgrade backup for an incompatible rollback.

Sources: [KitchenService](../../backend/TavoloFlow.Api/Kitchen/KitchenService.cs),
[response contracts](../../backend/TavoloFlow.Api/Kitchen/KitchenContracts.cs),
[kitchen hook](../../frontend/src/features/kitchen/useKitchen.ts),
[pass hook](../../frontend/src/features/pass/usePass.ts),
[live-view rules](../../frontend/src/lib/live-view.ts).

Tests: [kitchen/pass integration](../../backend/TavoloFlow.Api.Tests/KitchenTests.cs),
[upgrade tests](../../backend/TavoloFlow.Api.Tests/ItemProcessingMigrationTests.cs),
[kitchen logic](../../frontend/tests/kitchen.test.ts), [pass logic](../../frontend/tests/pass.test.ts).
Manual scenarios: two devices race on one line, cancellation versus closure, lost responses with
GET-only recovery, category selection, multiple pages, first-load/resume sound baselines, offline write
gating and delivery/closure removing the correct waiting lines. Check phones and tablets in all languages.
