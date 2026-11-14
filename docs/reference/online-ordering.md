# Online ordering

Online ordering lets customers order from a restaurant's own link, `/r/{slug}`, and collect in store.
It is being built in steps on `feature/online-ordering`; the design and its open steps are in
[the design document](../online-ordering.md) (Chinese). This reference describes what exists today:
the per-restaurant services and link, the restaurant's online settings, the data model of online
requests and the customer APIs (menu, submission, recovery and status). Staff cannot accept or reject
requests yet, so every request currently expires.

## Services and link

The platform turns QR dine-in and online ordering on per restaurant and sets the online link. The
contracts (`services`, `slug`, `SERVICE_HAS_OPEN_WORK`, `SLUG_CONFLICT`, `DINE_IN_NOT_OFFERED`) are in
[accounts and platform](accounts-platform.md#services-and-online-link). Store identity carries
`services: { dineIn, online }`: online ordering adds the Online ordering entry to 首页 for both roles,
and pages of a service that is off render a "service not offered" state.

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
- Frontend: `tests/online.test.ts` (phone, time inputs, week validation), `tests/navigation.test.ts`
  and the `/r/{slug}` cases in `tests/public-menu.test.ts`.
