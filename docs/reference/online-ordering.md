# Online ordering

Online ordering lets customers order from a restaurant's own link, `/r/{slug}`, and collect in store.
It is being built in steps on `feature/online-ordering`; the design and its open steps are in
[the design document](../online-ordering.md) (Chinese). This reference describes what exists today:
the per-restaurant services and link, the restaurant's online settings, the data model of online
requests, the customer APIs (menu, submission, recovery and status), the customer pages, and the staff
side: the pending banner and ringing, the online orders page, acceptance and rejection, and how
accepted online orders appear in the kitchen, pass, bills and history.

## Services and link

The platform turns QR dine-in and online ordering on per restaurant and sets the online link. The
contracts (`services`, `slug`, `SERVICE_HAS_OPEN_WORK`, `SLUG_CONFLICT`, `DINE_IN_NOT_OFFERED`) are in
[accounts and platform](accounts-platform.md#services-and-online-link). Store identity carries
`services: { dineIn, online }`: online ordering adds the Online orders (`/staff/online`) and Online
ordering settings (`/staff/online-settings`) entries to 首页 for both roles, and pages of a service that
is off render a "service not offered" state.

## Settings APIs

| Method and path                  | Role         | Input → result                                                   |
| -------------------------------- | ------------ | ---------------------------------------------------------------- |
| `GET /api/staff/online/settings` | STAFF, OWNER | → settings                                                       |
| `PUT /api/staff/online/pause`    | STAFF, OWNER | `{ until: "SLOT" \| "TODAY" }` → settings                        |
| `DELETE /api/staff/online/pause` | STAFF, OWNER | → settings (resumes)                                             |
| `PUT /api/owner/online/hours`    | OWNER        | `{ slots: [{ weekday, opensMinute, closesMinute }] }` → settings |
| `PATCH /api/owner/online/phone`  | OWNER        | `{ publicPhone }`, blank clears → settings                       |

Settings are `{ slug, publicPhone, hours, pausedUntil, status, nextOpensAt, currentSlotEndsAt }`.
`hours` are ordered by weekday and opening time. `pausedUntil` is null once the pause has lapsed.
`nextOpensAt` accompanies `CLOSED_HOURS` and is null when the week has no slots. `currentSlotEndsAt`
is set while a slot accepts orders. Times are UTC.

The read is one Repeatable Read snapshot. Every write owns a transaction, takes restaurant UPDATE
(so a later submission holding restaurant SHARE sees the old or the new settings, never half), rejects
a restaurant without online ordering with `ONLINE_NOT_OFFERED` (409) and returns the fresh settings.
Inputs reject unknown fields. Writes send their target, persist no pending marker and have no
automatic retry: after an unknown result the page rereads the settings and a person decides again.

## Hours

Each weekday has at most two slots in the restaurant's local time, stored in `online_hours` as
minutes of the day. A slot opens at `opensMinute` and stops taking orders at `closesMinute`
(exclusive, up to 1440 = midnight), so slots never cross midnight; the second slot of a day starts no
earlier than the first ends. The end is the last moment to order, not the closing time. Saving
replaces the whole week; the server numbers the slots by opening time. Invalid weeks return
`VALIDATION_FAILED`.

Comparisons use local wall-clock minutes from the injected `TimeProvider`: a slot accepts orders when
`opensMinute <= now < closesMinute`. `nextOpensAt` is the next slot start within seven days, converted
to UTC. A start that falls in the hour skipped by a spring DST change moves to the jump; a time that
occurs twice in autumn takes its first occurrence. Calendar rules live in `Online/OnlineSchedule.cs`
and are unit-tested with Europe/Rome DST dates.

## Pause

`restaurants.online_paused_until` holds the end of a pause, and the pause lapses once that time
passes; nothing clears it on a schedule. `SLOT` pauses until the current slot ends and returns
`ONLINE_CLOSED` (409) outside the hours. `TODAY` pauses until the next local midnight and works at any
time, for an unexpected day off; several days off are an hours change. Resuming clears the column.

## Availability

`OnlineAvailability.Evaluate` is the only rule for whether customers can order online now. The
settings page, the online menu and submissions all call it (through `OnlineAvailability.ReadAsync`,
which loads the hours and counts waiting requests in the caller's transaction). In order:

| Status         | When                                                  |
| -------------- | ----------------------------------------------------- |
| `SUSPENDED`    | The restaurant's service is not ACTIVE                |
| `NOT_OFFERED`  | Online ordering is off or the public phone is missing |
| `PAUSED`       | `online_paused_until` is in the future                |
| `CLOSED_HOURS` | No slot contains the current local time               |
| `BUSY`         | 20 requests are waiting for acceptance                |
| `OPEN`         | Otherwise                                             |

`BUSY` comes last, so closed hours or a pause explain themselves first. Only waiting requests count
(`OnlineRequestState.Waiting`); expired ones never fill the cap.

## Data model

A submission is one `online_requests` row. Acceptance, rejection and expiry are derived, never stored
as a status:

| Phase      | Rule                                                          |
| ---------- | ------------------------------------------------------------- |
| `ACCEPTED` | `accepted_at` is set (with `estimated_at` and `session_id`)   |
| `REJECTED` | `rejected_at` is set (`reject_reason` optional)               |
| `WAITING`  | neither, and now is before `expires_at` (submission + 10 min) |
| `EXPIRED`  | neither, and now is at or after `expires_at`                  |

`Online/OnlineRequestState` holds the only copy of this rule: `Waiting(restaurantId, now)` for queries
(a time range of the partial index `ix_online_requests_waiting`, never a history scan) and `Phase` in
memory. Now always comes from `TimeProvider` as a parameter, never SQL `now()`, so expired requests can
neither fill the waiting cap nor block switching online ordering off. The platform services switch
already uses it: turning online ordering off is refused while a request is waiting or an online session
is ACTIVE; turning dine-in off looks only at ACTIVE dine-in sessions.

`online_requests` keeps the daily number (`business_date`, `number`, unique per restaurant and day,
shared by pickup and delivery), a random status token, the fulfillment (`PICKUP`/`DELIVERY`), the
customer's contact (nullable so it can be cleared after 30 days; address and notes are delivery only),
the default language and item total at submission, and `lines`: a jsonb array of `OrderLineSnapshot`,
the same snapshot fields as an order item with options nested as in `options_snapshot`.
`OrderLineSnapshot.ToOrderItem` is the only conversion to an order item, and QR orders already build
their items through it; `OrderLineSnapshotTests` fails when an order item gains a snapshot field the
line does not carry. `lines.menuItemId` is not a foreign key, so dish deletion never touches requests.
Check constraints allow at most one decision, only before `expires_at`, with the three acceptance
columns set together and `OUT_OF_RANGE` only for delivery.

`online_counters` holds each restaurant-day's last number. Accepted online orders become
`dining_sessions` rows with `channel` `PICKUP` or `DELIVERY` (dine-in visits are `DINE_IN`): no table,
table label or join code, `delivery_fee_cents` required for delivery only, and `NO_SHOW` as their own
closure reason while `EMPTY` stays dine-in only. Every new table cascades from the restaurant; the
request's session link is a composite `(session_id, restaurant_id)` key.

## Customer APIs

All are anonymous under `/api/public` (Guest scheme, no cookie needed). The submission is a write, so
it carries a CSRF token from `GET /api/public/csrf`; the browser must send the antiforgery cookie
(`credentials: same-origin`).

| Method and path                                                    | Result                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `GET /api/public/r/{slug}/bootstrap`                               | Restaurant, status, `nextOpensAt`, menu       |
| `POST /api/public/r/{slug}/requests`                               | 201 first time, 200 repeat: submission result |
| `GET /api/public/r/{slug}/requests/by-client-id/{clientRequestId}` | Submission result, or 404 "not found yet"     |
| `GET /api/public/online-orders/{token}`                            | Status page                                   |

The bootstrap reads restaurant, hours, waiting count and `MenuReader` in one Repeatable Read
transaction. It returns `restaurant { id, name, currencyCode, defaultLanguage, theme, publicPhone }`,
`status`, `nextOpensAt` and the same `menu` as the QR bootstrap; the menu is shown in every status.
An invalid or unknown slug is `ONLINE_LINK_NOT_FOUND` (404).

The submission body is `{ clientRequestId, fulfillment, customerName, customerPhone, deliveryAddress?,
deliveryNotes?, items }`, unknown fields rejected; `items` uses the QR order line format and the shared
`OrderLines` checks (1–30 lines, 1–20 portions each, 100 in all, 200-character remarks, `optionIds`
required). The name is trimmed to 1–30 characters and the phone follows `InputRules.NormalizePhone`.
Pickup takes no address; delivery needs one (1–200, notes up to 100) but is refused with
`DELIVERY_NOT_OFFERED` until delivery settings exist. The server then:

1. Validates the format (`VALIDATION_FAILED`) before any write.
2. Finds the restaurant by slug and locks it SHARE, rechecking the slug.
3. Takes the next number of the restaurant's local business date with
   `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` on `online_counters`. The counter row serializes a
   restaurant's submissions for that day.
4. Returns the stored result of an existing `(restaurant, clientRequestId)` and rolls back, so a repeat
   skips every later gate and uses no number.
5. Requires `OPEN`: `SERVICE_SUSPENDED`, `ONLINE_NOT_OFFERED`, `ONLINE_PAUSED`, `ONLINE_CLOSED` (with
   `nextOpensAt` when the week has a slot) or `ONLINE_BUSY` (all 409).
6. Checks dishes, options, availability and prices like QR orders (`MENU_CHANGED` with `changes`) and
   builds the line snapshots.
7. Inserts the request with a random 32-byte Base64URL status token and `expires_at` ten minutes after
   submission, and returns `{ statusToken, number, expiresAt }`.

A rejected submission rolls back and uses no number. Submissions are limited to 10 per IP address per
ten minutes (`OnlineRateLimits:SubmissionsPerIpPerTenMinutes`, `RATE_LIMITED` with `Retry-After`). The
30-day contact cleanup is not built yet.

Recovery takes the random `clientRequestId` as its credential: only the submitting device knows it. It
returns the same `{ statusToken, number, expiresAt }`; `ONLINE_REQUEST_NOT_FOUND` (404) only means the
request has not been found yet, and a slug that no longer exists is `ONLINE_LINK_NOT_FOUND`.

The status page reads one Repeatable Read snapshot by token (`ONLINE_ORDER_NOT_FOUND`, 404, for an
unknown token). It returns `restaurant { name, slug, currencyCode, defaultLanguage, theme, publicPhone
}`, `number`, `customerName`, `fulfillment`, `submittedAt`, `expiresAt`, `phase` (`WAITING`, `EXPIRED`,
`REJECTED` or `ACCEPTED`, from `OnlineRequestState`), `rejectReason`, `estimatedAt`, `sessionStatus` and
`closeReason` once accepted, `items` and `totalAmountCents`. Before acceptance the items are the
submitted snapshot (`status` null) and the total is the submitted item total; after acceptance they are
the order items with their status and the total is the session's bill amount (`SessionSummaries`). It
never returns the customer's phone, an address or any request or session ID. The 24-hour limit after
an order ends is not built yet.

## Customer pages

`features/online-order/` serves three anonymous routes outside the staff and platform layouts; none
links a manifest, and Caddy's SPA fallback lists `/r` and `/o` beside `/q`.

| Route               | Page                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `/r/{slug}`         | Menu, cart and checkout (`OnlineMenuPage`)                               |
| `/r/{slug}/privacy` | Privacy notice (`PrivacyPage`; the route file is `r.$slug_.privacy.tsx`) |
| `/o/{token}`        | Order status (`OnlineOrderPage`)                                         |

Query keys use the `public` prefix, so staff sign-in and sign-out never clear them:
`["public", "online", slug]` for the bootstrap (reread every 30 seconds, shared by the menu and the
privacy page) and `["public", "online-order", token]` for the status page (every 10 seconds while
visible and online, stopping once the order has ended). Reads use `publicRequest`; the submission uses
`publicWrite`, which fetches the public CSRF token and sends same-origin credentials for the
antiforgery cookie. The language follows the QR menu's rule and storage key
(`tavoloflow:menu-language:{restaurantId}`), so a customer's choice is shared by a restaurant's QR and
online pages; the status response carries the restaurant `id` for this. Loaded pages apply the
restaurant theme, and every page ends with the source link.

The menu reuses the QR page's `MenuList`, option picker, `CartBar` and the cart's line list
(`CartLines`); their props take any cart with `{ lines, pending }`, and the pure line rules in
`orders/state.ts` (`addItem`, `editLine`, `refreshCart`, `validateCart`) are generic over it. The header
shows the restaurant's phone as a `tel:` link. A status other than `OPEN` is explained with the phone
and keeps the checkout closed; browsing and building a cart stay possible. A remembered order still in
progress shows "you have an order in progress" with a link to its status page.

The cart lives in `sessionStorage` under `tavoloflow:cart:{restaurantId}:online` (version 1, separate
from every QR cart), with the QR cart's limits. Checkout is two steps: "Checkout" rereads the bootstrap,
requires `OPEN` and refreshes the lines' prices and choices; the confirmation then shows the lines,
total, name and phone fields (validated like the server), the as-soon-as-possible note and a one-line
privacy notice linking to the privacy page. Placing the order builds the intent (request ID from
`randomUuid`, trimmed name, normalized phone, lines with confirmed prices), writes it into the cart and
reads it back before the POST; blocked storage allows editing but not sending. A saved intent must
match its frozen lines exactly or the cart is reported damaged.

On success the cart is cleared, the status token is remembered per restaurant in `localStorage`
(`tavoloflow:online-order:{restaurantId}`, cleared once that order has ended or is unknown) and the page
opens `/o/{token}`. An understood rejection of a first attempt frees the cart and says why, with the
restaurant's phone. A lost or failed response keeps the intent pending: the page recovers by
`GET .../requests/by-client-id/{id}` on mount and every 30 seconds while pending, never by POST, and
offers "check the result", "retry the same order" (the identical saved request with a fresh CSRF token)
and the phone. After an unknown result, a retry frees the intent only when it is rejected with a code
the server returns after its duplicate check (`SERVICE_SUSPENDED`, `ONLINE_NOT_OFFERED`,
`ONLINE_PAUSED`, `ONLINE_CLOSED`, `ONLINE_BUSY`, `DELIVERY_NOT_OFFERED`, `MENU_CHANGED`): that check
runs inside the transaction holding the day's counter row, so such a rejection proves no request with
that ID was stored. Format, link, CSRF and rate-limit rejections come earlier and keep the intent
(`submissionFailure` in `state.ts`). Leaving the foreground or going offline cancels the request in
flight.

The status page shows the number, the customer's name, the submission and estimated times, the dishes
(cancelled ones struck through and not charged) and the total. `state.ts` derives what it says from
`phase`, `sessionStatus`, `closeReason` and the dish statuses (`orderView`, `statusCopy`): waiting,
expired, rejected with or without a reason, preparing (with the estimated time), ready, all dishes
cancelled, collected (`PAID`) and closed (`NO_SHOW` or `VOIDED`), with pickup and delivery wording.
When the order did not go ahead (expired, rejected, all cancelled) the phone moves from the header to
the most visible notice. Customers cannot cancel; the page says to call instead.

The privacy page names the restaurant as controller and TavoloFlow as processor, and lists the data,
purpose, legal basis (performance of the customer's own order), the 30-day retention, the customer's
rights and the browser storage used. Its wording is a draft to be reviewed before release.

## Staff decisions

| Method and path                               | Role        | Input → result                                                                    |
| --------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `GET /api/staff/online/pending`               | STAFF/OWNER | `{ items, now }`: every waiting request, oldest first, with contact and lines     |
| `GET /api/staff/online/active`                | STAFF/OWNER | `{ items }`: accepted orders whose session is ACTIVE, oldest acceptance first     |
| `POST /api/staff/online/requests/{id}/accept` | STAFF/OWNER | `{ estimatedMinutes }` (pickup: 10, 20, 30 or 45) → the active order              |
| `POST /api/staff/online/requests/{id}/reject` | STAFF/OWNER | `{ reason }`: null, `SOLD_OUT`, `BUSY`, `CLOSING` (`OUT_OF_RANGE` delivery) → 204 |

The pending list reads `OnlineRequestState.Waiting` with the time from `TimeProvider`; the cap and the
ten-minute window keep it small, so it has no paging and no limit, and `now` is the server's clock for
the page's countdown. Each pending item carries the number, fulfillment, name, phone, delivery address
and notes, submission and expiry times, the default language, the submitted lines (the status page's
line shape) and the item total. Active orders come from `dining_sessions` through the partial index
`ix_dining_sessions_active` (`restaurant_id, opened_at` where ACTIVE), never a history scan, and carry
the number, channel, contact, acceptance and estimated times and line counts (`itemCount`,
`newItemCount`, `readyItemCount`).

Acceptance locks restaurant SHARE, then the request row UPDATE (`RowLocks.OnlineRequestAsync`; global
order restaurant → online request), and requires the request to be still waiting at the current time,
otherwise `ONLINE_REQUEST_CHANGED` (409). A suspended restaurant returns `SERVICE_SUSPENDED`, like
opening a table; pause, hours and sold-out switches are not checked, and prices stay the submitted
snapshot. Delivery requests return `DELIVERY_NOT_OFFERED` until delivery acceptance (with its fee)
exists. Inside the same transaction it checks which dishes still exist (menu writers and dish deletion
hold restaurant UPDATE, so this cannot interleave), creates the ACTIVE `PICKUP` session (opened now,
bill version 1), its single order (`created_at` now, the request's client request ID, total and
default language) and the items through `OrderLineSnapshot.ToOrderItem` (a deleted dish leaves
`menu_item_id` null with the snapshot kept), then sets `accepted_at`, `estimated_at` (now plus the
minutes) and `session_id`. The order is created at acceptance, so the kitchen sorts it by then and the
order watermark rises: the kitchen chimes as for any new order.

Rejection is one conditional update of the request row, still waiting at the current time, with the
optional reason; `OUT_OF_RANGE` on a pickup request is `VALIDATION_FAILED`. A request that is no longer
waiting returns `ONLINE_REQUEST_CHANGED`; an unknown or foreign ID `ONLINE_REQUEST_NOT_FOUND` (404).
Neither write persists a browser pending marker: both apply only to a waiting request, so a repeat just
gets `ONLINE_REQUEST_CHANGED`, and the pending list itself shows whether a lost write went through.

### Banner and ringing

With online ordering on, `StaffLayout` mounts `OnlinePendingBanner` for signed-in staff. It polls
`GET /api/staff/online/pending` every 10 seconds while the page is visible and online (store key
`["online-pending", restaurantId, userId]`, shared with the online orders page) and, while requests
wait, shows one sticky line above every staff page: "N online orders to accept · View", or a warning
once the 20-request cap stops customers. It rings `onlineRing` (low-high pairs, unlike the kitchen's
rising pair and the pass's three beeps) every 3 seconds while the newest list is under 30 seconds old,
has someone waiting and the page is live (`shouldRing`), so a failed or paused poll stops it. There is
no mute or device switch: `useAlertSound(null, …)` is always on, and the kitchen's sound switch does not
touch it. The banner stays mounted at zero, so the first tap anywhere unlocks the browser's audio;
until then it says "tap the page to turn on the ringing".

### Online orders page

`/staff/online` (from 首页, with a back link) lists the pending requests, each with its number, pickup
badge, name, a `tel:` call button, waited and remaining time on the server's clock (`requestTimes`,
red under three minutes), the lines with options and remarks, and the subtotal. One tap on 10, 20, 30
or 45 minutes accepts; Reject opens `ConfirmDialog` with an optional reason. Writes are blocked while
the list is failed, stale or not refreshed since resume (`syncIsFresh`); every outcome rereads the
pending, active, kitchen, pass and bills views, and an unknown result says to check the refreshed list.
Below, the read-only In progress list shows each accepted order's number, name, call button, estimated
time and progress (cooking, ready or all cancelled): the only place STAFF see an accepted customer's
phone, since the kitchen and pass never show it.

### Kitchen, pass, bills and history

Kitchen orders, pass items and bill summaries carry `channel` (`DINE_IN`, `PICKUP`, `DELIVERY`) and a
nullable `tableLabel`. Kitchen and pass add `online: { number, customerName, estimatedAt }` (never the
phone or address); bill summaries add `online: { number, customerName, customerPhone, estimatedAt }`.
`lib/session-label.ts` names every session in one place: "Table 5", or "Pickup #12" with the customer
name and estimated time (`SessionName` puts them on a second, truncated line, and the cards holding it
take `min-w-0` so a long name never widens a 360px grid). The bills page lists every ACTIVE session in
all channels from `GET /api/staff/sessions/active` (see [billing](billing-history.md)). Online orders
close through the existing paths: PAID ("collected, check payment") and VOIDED (after telling the
customer); an online session always has its order, so EMPTY returns `SESSION_HAS_ORDERS`. Closed online
orders appear in history as "Pickup #12"; the table filter does not match them.

## Phone

`InputRules.NormalizePhone` removes whitespace and accepts an optional `+` and 6–15 digits, stored
without spaces (`ck_restaurant_public_phone`, `ck_online_request_phone`). It validates restaurant and
customer phones; the frontend repeats it in `features/online/state.ts`.

## Settings page

`/staff/online-settings` (from 首页, with a back link) shows the status, the full online link with copy
and open actions, and its QR PNG, generated in the browser with the table QR options and the same
`VITE_PUBLIC_BASE_URL` origin rule (`publicMenuUrl` accepts `/r/{slug}`). STAFF and OWNER pause or
resume; OWNER also edits the phone and the week. A missing phone or week is explained in one warning.
Time inputs cannot hold 24:00, so 00:00 as a closing time means midnight. The query key is
`["online-settings", restaurantId, userId]`; the visible page rereads it every 60 seconds because
slots and pauses change with the clock. Local form edits survive background refreshes until saved or
discarded.

## Verification entry points

- `RestaurantServicesTests`: service and link validation, open work (including expired, rejected and
  waiting requests and ACTIVE online sessions), the dine-in gate and the race with opening a table.
- `ApplicationDbContextTests`: channel and request check constraints and the cascade of hours, counters
  and requests (accepted ones with their sessions) on restaurant deletion; `OrderLineSnapshotTests`:
  the snapshot field correspondence and the `lines` JSON round trip; `ApiEnumTests`: multi-word enum
  text such as `DINE_IN`.
- `OnlineScheduleTests`: slot boundaries, adjacent slots, `nextOpensAt`, DST gap and repeated hour,
  end of day and the availability order, including `BUSY` last.
- `OnlineOrderingTests`: bootstrap statuses and unknown links; numbers per local business date without
  gaps; repeats (also concurrent) returning the stored result; hour boundaries, summer time, a lapsing
  pause and every gate code; input validation and CSRF; `MENU_CHANGED` and option snapshots; the cap
  counting only waiting requests (twenty expired ones never block); the rate limit; recovery scoped to
  the restaurant; every status-page phase without private fields; and the race between a submission
  and switching online ordering off (`LockGate`).
- `OnlineSettingsTests`: OWNER-only phone and hours, validation, whole-week replacement, both pauses
  lapsing with `TestClock.Set`, `ONLINE_CLOSED`, `ONLINE_NOT_OFFERED`, `SUSPENDED`, the database
  constraints and the cascade on restaurant deletion.
- `OnlineStaffTests`: the pending list (only waiting requests, oldest first, expiry at `expires_at`,
  other restaurants hidden, server time), acceptance creating the session, order and items at the
  acceptance time with options and allergens, the kitchen ticket and watermark, the expiry boundary,
  invalid minutes, `SERVICE_SUSPENDED`, `DELIVERY_NOT_OFFERED`, pause/hours/sold-out ignored, repeats
  and foreign IDs, rejection reasons, accept/reject races (exactly one wins), acceptance racing dish
  deletion (`LockGate`), and an accepted order through ready, pass, checkout, VOIDED, the EMPTY refusal,
  the active sessions list and history.
- Frontend: `tests/online.test.ts` (phone, time inputs, week validation, banner, ringing, countdown on
  the server's clock, progress, session labels), `tests/navigation.test.ts`,
  the `/r/{slug}` cases in `tests/public-menu.test.ts`, and `tests/online-order.test.ts` (cart key,
  checkout rules, intent and restore, failure disposition including retries after an unknown result,
  remembered status link, every status-page state).
- Manual: at 360px in zh, it and en, browse, choose options, check the form errors, place an order
  and follow it to the status page; open the privacy page; reopen the menu to see the order in
  progress; simulate a lost response (recovered by GET, one POST), a request that never arrived
  (manual retry resends it unchanged), a reload during an unknown result, and a retry rejected by a
  pause (the cart is freed); pause and check that the checkout stays closed. Staff side at 360px in zh,
  it and en: the banner and its tap hint on every staff page, the ringing continuing with the kitchen
  sound off, accept and reject (with the dialog), a lost accept response, the kitchen, pass, bills and
  history labels with a 30-character name, and checkout of a pickup order.
