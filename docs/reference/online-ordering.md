# Online ordering

Online ordering lets customers order from a restaurant's own link, `/r/{slug}`, and collect in store
or, where the restaurant delivers, have it delivered.
It was built in steps on `feature/online-ordering`; the design and the steps are in
[the design document](../online-ordering.md) (Chinese). This reference describes what exists today:
the per-restaurant services and link, the restaurant's online settings, the data model of online
requests, the customer APIs (menu, submission, recovery and status), the customer pages, and the staff
side: the pending banner and ringing, the online orders page, acceptance and rejection, and how
accepted online orders appear in the kitchen, pass, bills and history, plus lock-screen push of new
orders to staff devices.

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
| `PUT /api/owner/online/delivery` | OWNER        | `{ enabled, noteZh, noteIt, noteEn }` → settings                 |
| `POST /api/owner/online/coupons` | OWNER        | `{ code, percentOff, validUntil }` → settings                    |
| `DELETE /api/owner/online/coupons/{id}` | OWNER | → settings (also when already gone)                              |

Settings are `{ slug, publicPhone, hours, pausedUntil, status, nextOpensAt, currentSlotEndsAt,
deliveryEnabled, deliveryNoteZh, deliveryNoteIt, deliveryNoteEn, coupons }`; each coupon is
`{ id, code, percentOff, validUntil, expired }`, ordered by code.
`hours` are ordered by weekday and opening time. `pausedUntil` is null once the pause has lapsed.
`nextOpensAt` accompanies `CLOSED_HOURS` and is null when the week has no slots. `currentSlotEndsAt`
is set while a slot accepts orders. Times are UTC. Delivery never changes `status`: pickup stays
possible whether or not the restaurant delivers.

The read is one Repeatable Read snapshot. Every write owns a transaction, takes restaurant UPDATE
(so a later submission holding restaurant SHARE sees the old or the new settings, never half), rejects
a restaurant without online ordering with `ONLINE_NOT_OFFERED` (409) and returns the fresh settings.
Inputs reject unknown fields. Writes send their target, persist no pending marker and have no
automatic retry. Editing and resetting are disabled during a save. Writes use `useOperations` and
abort/ignore late results after lifecycle or identity changes. On a current success the page cancels
older settings reads, caches the returned settings and clears that save's draft. Failure keeps the
draft; existing 60-second polling and ordinary focus/reconnect reads reveal later changes. There is
no extra post-write GET, pending marker or recovery loop.

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

## Delivery settings

Restaurant-run delivery is an OWNER setting on `restaurants`: `delivery_enabled` (default false) and an
optional note per language (`delivery_note_zh`, `delivery_note_it`, `delivery_note_en`, up to 500
characters each once trimmed; blank is stored as NULL) with the delivery area and fee rules. The write
replaces the switch and the three notes together, under restaurant UPDATE like the other settings;
`enabled` is required and longer notes return `VALIDATION_FAILED`. Notes are optional: without one,
checkout only says that the restaurant confirms the fee. Turning delivery off keeps the notes and only
stops new delivery submissions; waiting delivery requests can still be accepted or rejected and
accepted ones close as usual. There is no fee rule in code: whoever accepts a delivery order enters
its fee.

## Coupons

A coupon is a code the owner shares (Instagram, flyers, delivery bags) for a percentage off the dishes of
online orders, never QR dine-in. Each is one `online_coupons` row: `code` (3–20 letters or digits, stored
uppercase and unique per restaurant: `uq_online_coupon_code`, `ck_online_coupon_code`), `percent_off`
(whole, 1–50: `ck_online_coupon_percent`, so an online bill with any dish left stays positive and PAID
still works) and an optional inclusive `valid_until`, the last local business date it works. Codes can
be used any number of times; without customer accounts there is no once-per-customer or first-order
rule. `Online/OnlineCoupons.cs` holds the only copy of the rules: `Normalize` (trim and uppercase, then
the format), `IsValid(coupon, businessDate)` with the date from `TimeProvider`, and `DiscountCents`.

Coupons are created and deleted, never edited. Creation trims and uppercases the code, refuses a
`validUntil` before the restaurant's local today (`VALIDATION_FAILED`), an existing code
(`COUPON_CODE_TAKEN`, 409, checked first so a repeated create explains itself) and a 51st coupon
(`COUPON_LIMIT`, 409). Deleting removes only the restaurant's own row and returns the settings even when
nothing was left to delete. Both writes follow the settings rules above: restaurant UPDATE (which also
serializes the code and limit checks), `ONLINE_NOT_OFFERED`, the fresh settings and no pending marker.
`expired` compares `valid_until` with the restaurant's local date, and nothing deletes expired coupons;
the owner deletes them when they want. Turning online ordering off keeps the coupons.

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

A submission is one `online_requests` row, with optional legacy-compatible browser/IP source digests. Acceptance, rejection and expiry are derived, never stored
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
columns set together and `OUT_OF_RANGE` only for delivery. `coupon_code` and `coupon_percent_off` copy
the coupon a submission used, set together or both NULL (`ck_online_request_coupon`); they are not a
foreign key, so deleting or expiring the coupon never changes requests or bills.

`online_counters` holds each restaurant-day's last number. Accepted online orders become
`dining_sessions` rows with `channel` `PICKUP` or `DELIVERY` (dine-in visits are `DINE_IN`): no table,
table label or join code, `delivery_fee_cents` required for delivery only, and `NO_SHOW` as their own
closure reason while `EMPTY` stays dine-in only. Every new table cascades from the restaurant; the
request's session link is a composite `(session_id, restaurant_id)` key.

## Customer APIs

All are anonymous under `/api/public` (Guest scheme, no login needed). The submission is a write, so
it carries a CSRF token from `GET /api/public/csrf`; the browser must send the antiforgery cookie
(`credentials: same-origin`).
The customer APIs explicitly select Guest authentication while allowing anonymous access, so Store
and Platform sign-ins can coexist in the same browser without affecting online ordering. If a Guest
cookie is present, both CSRF issuance and submission use that identity; no Guest login is required.
CSRF issuance also initializes the independent browser marker described below.

| Method and path                                                    | Result                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `GET /api/public/r/{slug}/bootstrap`                               | Restaurant, status, `nextOpensAt`, menu       |
| `GET /api/public/r/{slug}/ordering-context` | This browser’s waiting submission, or null |
| `GET /api/public/r/{slug}/coupons/{code}`                          | `{ code, percentOff }`, or 404 `COUPON_INVALID` |
| `POST /api/public/r/{slug}/requests`                               | 201 first time, 200 repeat: submission result |
| `GET /api/public/r/{slug}/requests/by-client-id/{clientRequestId}` | Submission result, or 404 "not found yet"     |
| `GET /api/public/online-orders/{token}`                            | Status page                                   |

### Submission and query abuse protection

`OnlineRateLimitMiddleware` applies endpoint metadata after routing and before authentication, CSRF
and model binding. Every submission attempt counts, including invalid JSON, invalid CSRF and repeats.
Each endpoint family has its own per-IP budget across restaurants; a rejection is `RATE_LIMITED` (429)
with `Retry-After`, the ordinary error envelope and `Cache-Control: no-store`.

| `OnlineRateLimits` setting | Default |
| --- | --- |
| `SubmissionsPerIpPerMinute` | 3 |
| `SubmissionsPerIpPerTenMinutes` | 10 |
| `MaxWaitingPerIp` | 5, per restaurant |
| `MenusPerIpPerMinute` | 120 |
| `StatusChecksPerIpPerMinute` | 240 |
| `RecoveriesPerIpPerMinute` | 60 |
| `ContextChecksPerIpPerMinute` | 120 |
| `CouponChecksPerIpPerTenMinutes` | 30 |

Configure these through normal .NET configuration, for example
`OnlineRateLimits__MaxWaitingPerIp=5` on the API process. With production Compose, pass an override
through the API service’s `environment` section; adding it only to the host `.env` does not forward it. Frequency counters remain process-local and reset on restart;
waiting slots are checked in PostgreSQL and apply across API instances. Neither controls notification
behavior. Optional deployment-wide Turnstile verification is described below.

`OnlineBrowser` uses Data Protection to sign a random 32-byte marker in the host-only
`TavoloFlow.OnlineBrowser` cookie: HttpOnly, SameSite=Strict, path `/api/public`, Secure outside
Development (and on local HTTPS), fixed 30-day expiry without sliding renewal. It is independent of
Store, Platform and Guest authentication. `GET /api/public/csrf` and
`GET /api/public/r/{slug}/ordering-context` create or replace a missing, invalid or expired marker.
Submission requires a valid marker (`ONLINE_BROWSER_REQUIRED`, 400, otherwise), rather than minting
one during the POST. Clearing cookies can replace a marker; IP protections still apply.

The new anonymous `GET /api/public/r/{slug}/ordering-context` uses same-origin credentials and returns
`{ pending: { statusToken, number, expiresAt } | null }` for this browser and restaurant only. No phone
lookup or other customers' orders are exposed. Ordinary public menu, recovery and status reads still
omit cookies. A restaurant's legacy requests without source metadata retain their original recovery
links and count toward the restaurant's 20-request cap, but have no inferred browser/IP owner.

Every new request records restaurant-scoped SHA-256 digests `browser_key` and `ip_key`, both present
or both NULL (`ck_online_request_source`). The IP comes from `RemoteIpAddress` after trusted-proxy
processing, with IPv4-mapped IPv6 normalized; unavailable IPs share the `unknown` bucket. These are
linkage keys, not anonymization guarantees. They are never returned or logged. Acceptance and
rejection clear them in their own conditional update, because a decided request no longer occupies a
waiting slot; an expired request keeps them until the contact cleanup of the next successful
submission clears data older than 30 days. The existing waiting index bounds source checks; there are
no extra queue counters or cleanup jobs.

After the existing request-ID duplicate check, inside the same restaurant submission transaction:

- An existing waiting request for this browser rejects a new ID with `ONLINE_BROWSER_PENDING` (409)
  and `existingSubmission: { statusToken, number, expiresAt }`.
- Five waiting requests from this IP reject a new ID with `ONLINE_IP_WAITING_LIMIT` (409), without
  disclosing any of those orders.
- Accepted, rejected and expired requests release their slots through `OnlineRequestState.Waiting`.
  Failed submissions roll back their daily number. An original request ID still returns its stored
  result before source limits; repeated POSTs remain subject to the outer frequency budget.

These two source-cap codes prove the current ID was not stored and may free an unknown intent.
`RATE_LIMITED` and `ONLINE_BROWSER_REQUIRED` occur before that proof and must retain an unknown intent.
GET recovery has its own budget and does not depend on the browser marker.

### Turnstile verification

Turnstile is deployment-wide, not a restaurant setting. `Turnstile:Enabled` defaults to true in
Production and false elsewhere; explicit false keeps the local source/rate protections without
loading any verification script or calling Cloudflare. When enabled, `SiteKey`, `SecretKey` and
`Hostname` are required. Known official dummy key pairs are allowed only in Development; they omit
action/cdata and return `example.com`, so only that recognized mode skips those response checks.
Missing values, placeholders, unpaired test keys and production dummy keys fail startup.

The menu bootstrap includes `turnstile: { siteKey } | null`. It never exposes the secret key.
`POST .../requests` accepts the optional transport-only `turnstileToken` (at most 2048 characters when
verification is enabled); it is not part of `OnlineIntent`, the saved cart or any order snapshot.
The cart remains version 2. The service first validates business input, resolves the restaurant and
looks for a committed original request. A found original returns without a provider call. Otherwise
`OnlineVerification` calls the fixed HTTPS Siteverify endpoint outside every database transaction,
with a five-second timeout, no redirects and no automatic retry. Only the secret and proof are sent;
no customer contact, menu contents or recovery credentials are sent or logged.

For real keys, success requires the configured hostname, `action=online_order`, and `cdata` equal to
lowercase SHA-256 of UTF-8 `restaurantIdN:clientRequestIdN` (GUIDs without hyphens, lowercase). The
frontend uses `@noble/hashes` SHA-256, including on plain-HTTP development phones; the server uses
.NET SHA-256. Binding prevents one proof from creating orders with different IDs or restaurants,
including during Cloudflare's token-redemption convergence window. The existing transaction then
rechecks the original ID under the restaurant submission lock before source/menu checks and insert.
There is no new database state or migration.

Invalid, missing, expired or mismatched proofs return `ONLINE_VERIFICATION_FAILED` (400). Timeout,
provider/network failure, invalid response or a provider-side secret error returns
`ONLINE_VERIFICATION_UNAVAILABLE` (503). Neither code proves absence of another in-flight original:
a first understood 400 frees its intent, while an unknown-result retry retains it; a 503 retains the
intent like other server failures. These codes must not enter the after-duplicate-check rejection list.
No failed verification allocates a number, waiting slot or notification.

Each failure inside the provider exchange logs one warning with the error code and a safe detail: the
provider's HTTP status, Cloudflare's `error-codes`, `empty response`, or the failed check
(`hostname mismatch`, `action mismatch`, `cdata mismatch`), so a wrong secret or hostname is
distinguishable from an outage. Network failures log the exception type. Keys, proofs, request IDs and
response bodies are never logged.

The widget is loaded only in checkout or an unknown-intent cart. A request ID is prepared before
verification, but the complete intent is still saved only immediately before POST. The Managed
widget uses flexible width, light theme and the customer's interface language. A proof expires or
is cleared after a submission attempt; key, language, request or component changes invalidate old
callbacks. Failed loading/rendering offers retry and the restaurant's phone. It never automatically
posts an order. GET recovery is independent; manual retry first GETs the original, and only a 404
allows the same saved intent to be retried with a fresh proof. Browsing and status/privacy pages do
not load the script. The privacy page's security verification section explains the optional direct
Cloudflare connection: Cloudflare processes the IP address and technical browser/device information,
possibly outside the EU/EEA, under its Turnstile privacy policy.

Production Compose passes `TURNSTILE_ENABLED` (default true), `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY`; the expected hostname comes from `DOMAIN`, not the request's Host header.
Create one Managed widget for that host, without pre-clearance; no DNS/CDN migration is needed.
`validate-turnstile.py` checks configuration offline before the installer loads an image or stops an
installed API. It cannot verify a key's authenticity or the dashboard's hostname settings: perform a
real-browser check with real keys before accepting customers. Infrastructure smoke tests explicitly
disable verification and separately test failed preflight without stopping the existing API.

Tests: `OnlineVerificationTests` and `FakeTurnstileService` cover proof binding/replay, provider
errors, configuration, recovery, concurrency without provider-held database locks and notifications;
`tests/verification.test.ts` covers the cross-runtime binding vector and stale proof contexts.
See [Cloudflare validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
and [testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

### Menu and submission contracts

The bootstrap reads restaurant, hours, waiting count and `MenuReader` in one Repeatable Read
transaction. It returns `restaurant { id, name, currencyCode, defaultLanguage, theme, publicPhone,
deliveryEnabled, deliveryNoteZh, deliveryNoteIt, deliveryNoteEn }`, `status`, `nextOpensAt` and the
same `menu` as the QR bootstrap; the menu is shown in every status.
An invalid or unknown slug is `ONLINE_LINK_NOT_FOUND` (404).

The coupon check trims and uppercases the typed code and answers `{ code, percentOff }` when the
restaurant has it and its `valid_until` has not passed in the restaurant's local date; otherwise
(unknown, expired, another restaurant's, or not a code at all) `COUPON_INVALID` (404). It is limited to
30 checks per IP address per ten minutes (`OnlineRateLimits:CouponChecksPerIpPerTenMinutes`,
`RATE_LIMITED`), so codes cannot be guessed by trying them all.

The submission body is `{ clientRequestId, fulfillment, customerName, customerPhone, deliveryAddress?,
deliveryNotes?, items, coupon?, turnstileToken? }`, unknown fields rejected; `items` uses the QR order line format and the shared
`OrderLines` checks (1–30 lines, 1–20 portions each, 100 in all, 200-character remarks, `optionIds`
required). The name is trimmed to 1–30 characters and the phone follows `InputRules.NormalizePhone`.
Pickup takes no address; delivery needs a trimmed address of 1–200 characters and takes optional
notes (doorbell, floor) of up to 100. `coupon` is null or `{ code, percentOff }`: the code the coupon
check confirmed and the percentage the customer saw, both required (a malformed one is
`VALIDATION_FAILED`). The server then:

1. Validates the format (`VALIDATION_FAILED`) before any write.
2. Finds the restaurant by slug and checks a committed original, then verifies a new request outside
   all locks when Turnstile is enabled. Begins the transaction and locks the restaurant SHARE,
   rechecking the slug.
3. Acquires the restaurant's transaction advisory submission lock, keyed by `hashtextextended` of
   `tavoloflow:online-submission:` plus the restaurant ID. Only then reads time and the local business
   date and takes the next number with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` on
   `online_counters`. The submission lock serializes one restaurant across midnight too, making both
   duplicate detection and the 20-request cap safe; other restaurants proceed independently.
4. Returns the stored result of an existing `(restaurant, clientRequestId)` and rolls back, so a repeat
   skips every later gate and uses no number.
5. Requires `OPEN`: `SERVICE_SUSPENDED`, `ONLINE_NOT_OFFERED`, `ONLINE_PAUSED`, `ONLINE_CLOSED` (with
   `nextOpensAt` when the week has a slot) or `ONLINE_BUSY` (all 409). A delivery request also needs
   the restaurant's delivery switch, otherwise `DELIVERY_NOT_OFFERED` (409); pickup never depends on it.
   A coupon must exist, still be valid on the business date read in step 3 and have the sent
   percentage, otherwise `COUPON_INVALID` (409): a coupon deleted and created again with another
   percentage is refused, never applied silently. Coupon writes take restaurant UPDATE, so the SHARE
   lock from step 2 sees each coupon whole or not at all.
6. Checks dishes, options, availability and prices like QR orders (`MENU_CHANGED` with `changes`) and
   builds the line snapshots.
7. Inserts the request with a random 32-byte Base64URL status token, `expires_at` ten minutes after
   submission and the coupon's code and percentage, and returns `{ statusToken, number, expiresAt }`.
   Acceptance never checks the coupon again: the customer was promised that total.
8. In the same transaction, clears the name, phone, address, notes and source digests of the restaurant's requests
   submitted more than 30 days before this one (`OnlineRequestService.ContactRetention`), reading only
   uncleared rows through `ix_online_requests_contact`. The lines stay. There is no background job: a
   restaurant's old contact data is cleared by its next submission.

A rejected submission rolls back and uses no number. Submissions use both the minute and ten-minute
per-IP budgets above (`RATE_LIMITED` with `Retry-After`).
Repeats and rejected submissions roll back, cleanup included.

Recovery takes the random `clientRequestId` as its credential: only the submitting device knows it. It
returns the same `{ statusToken, number, expiresAt }`; `ONLINE_REQUEST_NOT_FOUND` (404) only means the
request has not been found yet, and a slug that no longer exists is `ONLINE_LINK_NOT_FOUND`.

The status page reads one Repeatable Read snapshot by token (`ONLINE_ORDER_NOT_FOUND`, 404, for an
unknown token). It returns `restaurant { name, slug, currencyCode, defaultLanguage, theme, publicPhone
}`, `number`, `customerName`, `fulfillment`, `submittedAt`, `expiresAt`, `phase` (`WAITING`, `EXPIRED`,
`REJECTED` or `ACCEPTED`, from `OnlineRequestState`), `rejectReason`, `estimatedAt`, `sessionStatus` and
`closeReason` once accepted, `items`, `coupon` (`{ code, percentOff, discountCents }` or null),
`deliveryFeeCents` (once a delivery is accepted) and `totalAmountCents`. Before acceptance the items are
the submitted snapshot (`status` null) and the total is the submitted item total less the coupon's
discount (`OnlineCoupons.DiscountCents`, rounded down); after acceptance they are the order items with their status and the
total is the session's bill amount (`SessionSummaries`, with the fee while any dish counts and the
bill's own coupon discount, which follows cancellations). It
never returns the customer's phone, an address or any request or session ID. From 24 hours after the
order ended (`OnlineOrderStatusService.LinkLifetime`) the link returns `ONLINE_ORDER_NOT_FOUND`: the
end is the expiry, the rejection or the accepted order's session closure (`OnlineRequestState.EndedAt`),
so an order still waiting or in progress keeps its link. The page then says the order has ended, and
the menu forgets the remembered token.

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
restaurant theme.

The menu reuses the QR page's `MenuList`, option picker, `CartBar` and the cart's line list
(`CartLines`); their props take any cart with `{ lines, pending }`, and the pure line rules in
`orders/state.ts` (`addItem`, `editLine`, `refreshCart`, `validateCart`) are generic over it. The header
shows the restaurant's phone as a `tel:` button in every status. A status other than `OPEN` is
explained by a text-only notice below it and keeps the checkout closed; browsing and building a cart
stay possible. A remembered order still in
progress shows "you have an order in progress" with a link to its status page.

The menu also reads the same-origin ordering context on load, focus/reconnect and before checkout.
While a request waits, it refreshes that context every ten seconds while visible and online. The menu
and cart stay editable, but checkout is blocked with the existing order's link. A context failure
retains known data, blocks checkout and offers an explicit GET retry. Acceptance, rejection or expiry
releases checkout after the next read. A submission-time browser conflict keeps the new cart and
shows the old order separately; it never clears the new cart as if it had succeeded. All new notices
are available in Chinese, Italian and English.

The cart lives in `sessionStorage` under `tavoloflow:cart:{restaurantId}:online` (version 2: lines
carry the dish's sale price and the pending intent its coupon; separate from every QR cart, other
versions discarded as damaged), with the QR cart's limits. Checkout is two steps: "Checkout" rereads the bootstrap,
requires `OPEN` and refreshes the lines' prices and choices; the confirmation then shows the lines,
total, an optional coupon field, name and phone fields (validated like the server), the
as-soon-as-possible note and a one-line privacy notice linking to the privacy page. "Apply" (or Enter
in the field, which never places the order) trims and uppercases the code, asks the coupon check and,
on success, keeps `{ code, percentOff }` in the checkout form: the totals then show the subtotal, the
coupon line with its discount (`couponDiscountCents`, rounded down like the server) and the discounted
total, and "Remove" drops it. The panel and mobile cart bar share `onlineCartAmounts`: a coupon counts
while confirming, and an unresolved submission keeps the coupon saved in its intent, including after a
reload. Returning to ordinary cart editing shows the item total before the coupon. An unusable code says so
without touching the cart. With delivery on, the header says "pickup or delivery" and
the confirmation starts with a pickup/delivery choice; delivery adds the address and the optional
doorbell/floor notes, the restaurant's note in the customer's language (falling back to the default
language, then Italian, Chinese and English; `deliveryNote` in `state.ts`) and a line saying the
restaurant confirms the fee, which the status page shows after acceptance. The total is then labelled
as the items total, and the privacy line also names the address. If "Checkout" finds delivery turned
off since the customer chose it, the form goes back to pickup and says so; a `DELIVERY_NOT_OFFERED`
refusal says the restaurant isn't delivering and pickup is possible. Placing the order builds the
intent (request ID from `randomUuid`, fulfillment, trimmed name, normalized phone, trimmed address and
notes for delivery and null for pickup, lines with confirmed prices, the confirmed coupon or null),
writes it into the cart and reads
it back before the POST; blocked storage allows editing but not sending. A saved intent must match its
frozen lines and fields exactly or the cart is reported damaged.

On success the cart is cleared, the status token is remembered per restaurant in `localStorage`
(`tavoloflow:online-order:{restaurantId}`, cleared once that order has ended or is unknown) and the page
opens `/o/{token}`. An understood rejection of a first attempt frees the cart and says why, with the
restaurant's phone. A lost or failed response keeps the intent pending: the page recovers by
`GET .../requests/by-client-id/{id}` on mount and every 30 seconds while pending, never by POST, and
offers "check the result", "retry the same order" (the identical saved request with a fresh CSRF token)
and the phone. After an unknown result, a retry frees the intent only when it is rejected with a code
the server returns after its duplicate check (`SERVICE_SUSPENDED`, `ONLINE_NOT_OFFERED`,
`ONLINE_PAUSED`, `ONLINE_CLOSED`, `ONLINE_BUSY`, `DELIVERY_NOT_OFFERED`, `COUPON_INVALID`,
`ONLINE_BROWSER_PENDING`, `ONLINE_IP_WAITING_LIMIT`,
`MENU_CHANGED`): that check
runs inside the transaction holding the restaurant's cross-day submission lock and the day's counter
row, so such a rejection proves no request with
that ID was stored. Format, link, CSRF and rate-limit rejections come earlier and keep the intent
(`submissionFailure` in `state.ts`). A `COUPON_INVALID` refusal also drops the coupon from the form, so
the next checkout shows the full total. Leaving the foreground or going offline cancels the request in
flight.

The status page shows the number, the customer's name, the submission and estimated times, the dishes
(cancelled ones struck through and not charged), the coupon line while it takes something off, and the
total. Its status card puts each state's icon
beside the status line (state colours, with the restaurant's accent while the order is prepared) and,
once accepted, the estimated time in large type on its own. `state.ts` derives what it says from
`phase`, `sessionStatus`, `closeReason` and the dish statuses (`orderView`, `statusCopy`): waiting,
expired, rejected with or without a reason, preparing (with the estimated time), ready, all dishes
cancelled, collected (`PAID`) and closed (`NO_SHOW` or `VOIDED`), with pickup and delivery wording.
A delivery order names itself "Delivery · name"; while waiting its total is labelled as the items
total with "delivery fee to be confirmed" below it, and once accepted the fee appears above the total
(struck through and not charged when every dish is cancelled). When the order did not go ahead (expired, rejected, all cancelled) the phone moves from the header
into the status card. Customers cannot cancel; the page says to call instead.

The privacy page names the restaurant as controller and TavoloFlow as processor, and lists the data,
purpose, legal basis (performance of the customer's own order), retention, the customer's rights, the
browser storage used and the optional security verification. Retention states the actual mechanism:
contact data is deleted by the restaurant's next successful online submission once 30 days have
passed, and backup copies remain for at most 7 more days (`deploy/backup.sh` keeps seven days). No
scheduled cleanup is implemented; whether to add one is left to the pre-release privacy review.

The global lock order is restaurant → table → session, restaurant → menu item, restaurant → online
request, and restaurant → submission advisory lock → daily counter. Submission advisory locks are
transaction-scoped and release on commit or rollback.

## Staff decisions

| Method and path                               | Role        | Input → result                                                                    |
| --------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `GET /api/staff/online/pending`               | STAFF/OWNER | `{ items, now }`: every waiting request, oldest first, with contact and lines     |
| `GET /api/staff/online/active`                | STAFF/OWNER | `{ items }`: accepted orders whose session is ACTIVE, oldest acceptance first     |
| `POST /api/staff/online/requests/{id}/accept` | STAFF/OWNER | `{ estimatedMinutes, deliveryFeeCents }` → the active order (see below)          |
| `POST /api/staff/online/requests/{id}/reject` | STAFF/OWNER | `{ reason }`: null, `SOLD_OUT`, `BUSY`, `CLOSING` (`OUT_OF_RANGE` delivery) → 204 |

The pending list reads `OnlineRequestState.Waiting` with the time from `TimeProvider`; the cap and the
ten-minute window keep it small, so it has no paging and no limit, and `now` is the server's clock for
the page's countdown. Each pending item carries the number, fulfillment, name, phone, delivery address
and notes, submission and expiry times, the default language, the submitted lines (the status page's
line shape), the item total and `coupon` (`{ code, percentOff, discountCents }` on that total, or
null). Active orders come from `dining_sessions` through the partial index
`ix_dining_sessions_active` (`restaurant_id, opened_at` where ACTIVE), never a history scan. They are
built from the sessions' bill summaries (`SessionSummaries.Project`), so their amount is the bill's
own, and carry the number, channel, contact and address, acceptance (the session's opening) and
estimated times, line counts (`itemCount`, `newItemCount`, `readyItemCount`), `coupon` (the bill's,
discount on the dishes still charged), `deliveryFeeCents` (delivery only) and `totalAmountCents`, the
amount to collect.

Acceptance locks restaurant SHARE, then the request row UPDATE (`RowLocks.OnlineRequestAsync`; global
order restaurant → online request), and requires the request to be still waiting at the current time,
otherwise `ONLINE_REQUEST_CHANGED` (409). A suspended restaurant returns `SERVICE_SUSPENDED`, like
opening a table; pause, hours, sold-out and delivery switches are not checked, and prices stay the
submitted snapshot. `estimatedMinutes` is 10, 20, 30 or 45 for pickup and 30, 45, 60 or 90 for
delivery. A delivery request requires `deliveryFeeCents`, entered by whoever accepts from the address
and the restaurant's note: whole cents, 0 for free delivery, and no larger than keeps items plus fee a
safe integer; pickup takes none. Otherwise `VALIDATION_FAILED`. Inside the same transaction it checks which dishes still exist (menu writers and dish deletion
hold restaurant UPDATE, so this cannot interleave), creates the ACTIVE `PICKUP` or `DELIVERY` session (the request's
fulfillment, opened now, bill version 1, with the delivery fee on delivery), its single order (`created_at` now, the request's client request ID, total and
default language) and the items through `OrderLineSnapshot.ToOrderItem` (a deleted dish leaves
`menu_item_id` null with the snapshot kept), then sets `accepted_at`, `estimated_at` (now plus the
minutes) and `session_id` and clears the source digests. The order is created at acceptance, so the kitchen sorts it by then and the
order watermark rises: the kitchen chimes as for any new order.

Rejection owns a transaction and locks only the request row UPDATE. It then reads time from
`TimeProvider`, checks `OnlineRequestState.Phase` and conditionally updates the still-waiting row with
the optional reason, clearing its source digests; `OUT_OF_RANGE` on a pickup request is `VALIDATION_FAILED`. A request that is no longer
waiting, including one that expired while waiting for the lock, returns `ONLINE_REQUEST_CHANGED`;
an unknown or foreign ID `ONLINE_REQUEST_NOT_FOUND` (404).
Neither write persists a browser pending marker: both apply only to a waiting request, so a repeat just
gets `ONLINE_REQUEST_CHANGED`, and the pending list itself shows whether a lost write went through.

### Banner and ringing

With online ordering on, `StaffLayout` mounts `OnlinePendingBanner` for signed-in staff. It polls
`GET /api/staff/online/pending` every 10 seconds while the page is visible and online (store key
`["online-pending", restaurantId, userId]`, shared with the online orders page) and, while requests
wait, shows one sticky line above every staff page: "N online orders to accept · View", or a warning
once the 20-request cap stops customers. It rings `onlineRing` (low-high pairs, unlike the kitchen's
rising pair and the pass's three beeps) every 3 seconds while the newest list is under 30 seconds old,
has someone waiting and the shared `syncIsFresh` rule passes (no failed read, visible and online,
and refreshed since resume). A failed, stale or paused view stops the ringing; cached counts remain
visible without a separate unsynchronized state. There is no mute or device switch: `useAlertSound(null, …)` is always on, and the kitchen's sound switch does not
touch it. The banner stays mounted at zero, so the first tap anywhere unlocks the browser's audio;
until then it says "tap the page to turn on the ringing".

### Online orders page

`/staff/online` (from 首页, with a back link) lists the pending requests, each with its number,
fulfillment badge, name, a `tel:` call button, for delivery the address as a plain Google Maps search
link (`mapsUrl`) with the doorbell notes, waited and remaining time on the server's clock
(`requestTimes`, red under three minutes), the lines with options and remarks, and the subtotal; with a
coupon, its line and discount, and for pickup the amount to collect. One tap on 10, 20, 30 or 45
minutes accepts a pickup. A delivery first takes the fee (a decimal amount, 0 when free; `acceptFee`),
shows "subtotal + delivery fee = total" ("subtotal − discount + delivery fee = total" with a coupon), and only then enables 30, 45, 60 and
90 minutes. Reject opens `ConfirmDialog` with an optional reason; "outside the delivery area" is
offered for delivery only (`rejectReasons`). Writes are blocked while
the list is failed, stale or not refreshed since resume (`syncIsFresh`); every outcome rereads the
pending, active, kitchen, pass and bills views, and an unknown result says to check the refreshed list.
Below, the read-only In progress list shows each accepted order's number, name, estimated time, the
amount to collect (with the delivery fee it includes, while it counts, and a "coupon taken off" line),
call button, delivery address
link and progress (cooking, ready or all cancelled): the only place STAFF see an accepted customer's
phone and address, and what a rider collects, since the kitchen and pass never show them and STAFF have
no bills page.

### Kitchen, pass, bills and history

Kitchen orders, pass items and bill summaries carry `channel` (`DINE_IN`, `PICKUP`, `DELIVERY`) and a
nullable `tableLabel`. Kitchen and pass add `online: { number, customerName, estimatedAt }` (never the
phone or address); bill summaries add `online: { number, customerName, customerPhone, estimatedAt,
deliveryAddress, deliveryNotes, coupon }` and `deliveryFeeCents`; the bill total already takes the
coupon off (see the billing reference).
`lib/session-label.ts` names every session in one place: "Table 5", or "Pickup #12" with the customer
name and estimated time (`SessionName` puts them on a second, truncated line, and the cards holding it
take `min-w-0` so a long name never widens a 360px grid). The kitchen
dish view keeps only the short title and adds the estimated time beside the existing wait, without
a customer-name row. That second line stays on one line, keeping the estimated time whole and
allowing the wait to truncate at 360px. The bills page lists every ACTIVE session in
all channels from `GET /api/staff/sessions/active` (see [billing](billing-history.md)). A delivery bill
shows the dishes and the fee apart (the fee struck through once every dish is cancelled), the address
link and doorbell notes, and lets OWNER correct the fee before closure
(`PATCH /api/owner/sessions/{id}/delivery-fee`, see
[billing](billing-history.md#delivery-fee-correction)). Online orders close through the existing
paths: PAID ("collected, check payment"; for delivery "delivered, check payment") and VOIDED (after
telling the customer), plus `NO_SHOW` ("customer didn't come"; for delivery "not delivered": refused
or unreachable), OWNER-only through
`POST /api/owner/sessions/{id}/close-no-show` with PAID's conditions (see
[billing](billing-history.md#closure-conditions-and-transaction)); an online session always has its
order, so EMPTY returns `SESSION_HAS_ORDERS`. Closed online
orders appear in history as "Pickup #12" or "Delivery #12", with `NO_SHOW` worded by channel; the
table filter does not match them.

## Lock-screen push

Staff devices can receive a system notification for every new online request, so a locked phone or
a backgrounded app still hears about it; the page's own polling and ringing stay unchanged. Push is a
reminder only: a lost notification is acceptable and nothing depends on delivery.

### Server configuration

`WebPush:PrivateKey` is the VAPID P-256 private key as 64 hex characters (`openssl rand -hex 32`); the
public key browsers subscribe with is derived from it (`Push/PushKeys`). `WebPush:Subject` is the
`https:` or `mailto:` contact push services may use. Both empty turns push off (development, tests, the
demo and CI); only one set, a malformed key or a key outside the curve fails startup
(`PushOptionsValidator`, `ValidateOnStart`). Changing the key invalidates every device's subscription.
Production requires it: `deploy/compose.yaml` maps `VAPID_PRIVATE_KEY` from the server's `.env` (64 hex
characters and a valid P-256 private scalar, both checked by `install-release.sh` before the running
API stops) and sets the subject to `https://{DOMAIN}`; backups include `.env`, and so the key. The smoke
test rejects missing and invalid keys without stopping the old API, then checks that the public key is
identical across upgrade, restart, saved-configuration restore and rollback. Real push delivery remains
a manual device check.

### Device registration

| Method and path                       | Role        | Input → result                                               |
| ------------------------------------- | ----------- | ------------------------------------------------------------ |
| `GET /api/staff/push/key`             | STAFF/OWNER | `{ publicKey }`, null while push is off                      |
| `PUT /api/staff/push/subscription`    | STAFF/OWNER | `{ endpoint, p256dh, auth, language }` → 204                 |
| `DELETE /api/staff/push/subscription` | STAFF/OWNER | `{ endpoint }` → 204; only this restaurant's row, idempotent |

Both writes need the store CSRF token and an account that has changed its first password. The PUT
validates the device first (`VALIDATION_FAILED` with field errors): the endpoint must be an HTTPS URL
on the default port without credentials whose host is a known browser push service
(`fcm.googleapis.com`, `*.push.apple.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`;
`Push/PushEndpoints`), at most 2048 characters, because the server POSTs to it; `p256dh` must be a
base64url P-256 point and `auth` a 16-byte secret; `language` is `zh`, `it` or `en`. It then returns
`PUSH_NOT_CONFIGURED` (409) while push is off and `ONLINE_NOT_OFFERED` without online ordering.

The endpoint identifies the device, so the PUT is an upsert on `uq_push_subscription_endpoint`: saving
again updates the keys and language, and signing in on the device with another account, even of another
restaurant, moves the row there. The row records the account, its current `credential_version` and the
expiry of the store sign-in that registered it (the fixed 30-day ticket, read during cookie validation).
A restaurant keeps at most 20 devices that still receive (`PUSH_DEVICE_LIMIT`, 409); concurrent
registrations may pass this soft cap together. Neither write needs a browser pending marker: both are
idempotent.

`PushTargets.RemoveLapsedAsync` is the only rule for devices that no longer receive: the account is
inactive or must change its password, its credential version differs from the row's (own password
change, OWNER or platform reset, deactivation), or the registering sign-in has expired (time from
`TimeProvider`). Registering deletes those rows of the restaurant before counting the cap, so no
credential write needs to know about push. Deleting the account or the restaurant cascades.

### Devices in the browser

Home (首页) offers the switch while online ordering is on and the server has a key. One shared
controller confirms registration through a successful PUT, and reconciles on sign-in, language/password
changes, foreground return, focus and reconnect. A failed PUT keeps the browser subscription but shows
an unconfirmed state with retry and turn-off actions. A rotated endpoint is uploaded at the next check;
there is no service-worker background resubscription or retry timer.

Signing out pauses registration and waits for in-flight work, then sends the current browser endpoint
as `pushEndpoint` to `POST /api/auth/logout`. The server revokes that restaurant's row before clearing
the cookie. If the Service Worker API, staff registration or PushManager is absent, logout proceeds
without an endpoint. Actual browser-read or revocation failures leave the user signed in. The browser
subscription remains for the next sign-in. Already-dispatched notifications may still arrive. Browser
details are in [the staff PWA](pwa.md#lock-screen-push).

### Sending

Only a committed first submission notifies: `OnlineRequestService.SubmitAsync` enqueues the restaurant,
the number and the request's expiry after `CommitAsync`; repeats (200) and rejected submissions never do.
`PushQueue` is an in-process bounded channel (100 items, the oldest dropped when full) that accepts
nothing while push is off. `PushSender`, the app's only `BackgroundService`, reads it one item at a time:
it skips a request that has already expired, deletes the restaurant's lapsed devices through
`PushTargets`, then sends to every remaining device in parallel through the `push` HttpClient (10-second
timeout, no redirects) with `Lib.Net.Http.WebPush`: VAPID authentication (`Authorization: vapid t=…,
k=…`), aes128gcm encryption for that device, `TTL` the seconds left until `expires_at` and
`Urgency: high`. The encrypted payload is only `{ "number": 12, "language": "zh" }`: no name, phone,
address or ID, because notifications pass through the browser vendors' push servers.

Delivery is best effort: no retry, no outbox, and a restart loses queued items. A push service answering
404 or 410 means the browser dropped the subscription, so that row is deleted; any other failure is only
logged with its status code or exception type. The named `push` HttpClient disables its default loggers
because their URI paths contain endpoint secrets. Endpoints, keys and payloads are never logged.

## Phone

`InputRules.NormalizePhone` removes whitespace and accepts an optional `+` and 6–15 digits, stored
without spaces (`ck_restaurant_public_phone`, `ck_online_request_phone`). It validates restaurant and
customer phones; the frontend repeats it in `features/online/state.ts`. It accepts national and
international forms and adds no country code, so the hints do: checkout asks customers with a foreign
number to start with `+` and the country code, and the OWNER phone card suggests `+39`, so customers
with a foreign SIM can call the restaurant.

## Settings page

`/staff/online-settings` (from 首页, with a back link) shows the status, the full online link with copy
and open actions, and its QR PNG, generated in the browser with the table QR options and the same
`VITE_PUBLIC_BASE_URL` origin rule (`publicMenuUrl` accepts `/r/{slug}`). STAFF and OWNER pause or
resume; OWNER also edits the phone, the week, delivery (a switch and three note fields, with a
warning while delivery is on without any note) and coupons (a list with the percentage, last day or
an expired badge, a delete button behind `ConfirmDialog`, and a create form with code, percentage and
an optional date input). A partial date is refused with a translated field message; only a genuinely
empty control means no expiry. Submission reads the date control's current value and `validity.badInput`
again, because partial native date edits can leave the value empty without firing React's `onChange`.
A missing phone or week is explained in one warning. Each card shows its own saved or failed result
beside the button that sent it; the page top keeps only read errors.
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
  pause and every gate code; delivery only while its switch is on (address and notes stored, a repeat
  still answered after turning it off, pickup unaffected); input validation and CSRF; `MENU_CHANGED` and option snapshots; the cap
  counting only waiting requests (twenty expired ones never block); the rate limit; recovery scoped to
  the restaurant; every status-page phase without private fields; and the race between a submission
  and switching online ordering off (`LockGate`).
- `OnlineCouponTests`: OWNER-only coupon creation (normalized codes, per-restaurant uniqueness,
  validation, the inclusive last day in the restaurant's zone), idempotent deletion scoped to the
  restaurant, the 50-coupon limit, `ONLINE_NOT_OFFERED` and the coupon check constraints; the coupon
  check (case-insensitive, per restaurant, expiry, rate limit); submissions snapshotting the coupon, the
  status page discount, a repeat answered after the coupon's deletion, and `COUPON_INVALID` for unknown,
  expired or re-created codes without using a number; the pending, active, bill, status and history
  amounts through acceptance, a cancellation (rounding down), PAID, the fee correction and a fully
  cancelled delivery voided at zero.
- `OnlineSettingsTests`: OWNER-only phone, hours and delivery (trimmed notes, blank as null, 500
  characters, notes kept when off), validation, whole-week replacement, both pauses
  lapsing with `TestClock.Set`, `ONLINE_CLOSED`, `ONLINE_NOT_OFFERED`, `SUSPENDED`, the database
  constraints and the cascade on restaurant deletion.
- `OnlineStaffTests`: the pending list (only waiting requests, oldest first, expiry at `expires_at`,
  other restaurants hidden, server time), acceptance creating the session, order and items at the
  acceptance time with options and allergens, the kitchen ticket and watermark, the expiry boundary,
  invalid minutes, `SERVICE_SUSPENDED`, pause/hours/sold-out ignored, repeats
  and foreign IDs, rejection reasons, accept/reject races (exactly one wins), acceptance racing dish
  deletion (`LockGate`), and an accepted order through ready, pass, checkout, VOIDED, the EMPTY refusal,
  the active sessions list and history; `NO_SHOW` (OWNER only, online only, PAID's conditions,
  repeat, closure stamping, status page and history filter); delivery acceptance (fee required, 0
  allowed, overflow, delivery times, pickup without a fee, the delivery switch ignored, `OUT_OF_RANGE`)
  and the delivery bill (fee in PAID and NO_SHOW totals and history, a fully cancelled delivery voided
  at zero) and the OWNER fee correction (version, `SESSION_NOT_DELIVERY`, unchanged fee, overflow,
  a frozen checkout after a change, closed sessions).
- `PushSubscriptionTests`: key derivation against RFC 8291's example key and invalid configuration,
  startup with half the configuration, push off, device validation and the accepted push services,
  the endpoint upsert moving between accounts and restaurants, the 20-device cap counting only devices
  that still receive, scoped idempotent removal and the cascades.
- `OnlinePushTests` (a fake push service captures every request): only first submissions notify, every
  device of the restaurant and no other; the VAPID header verified against the public key, `TTL`,
  `Urgency` and `aes128gcm`, with the payload decrypted per RFC 8291 independently of the library; OWNER
  reset, own password change (and registering again), an inactive account, a pending password change
  and an expired sign-in stopping devices and deleting their rows; 404/410 deleting only that device;
  push off sending nothing; logout preventing later sends to that device; and logging at Trace
  exposing no endpoint, keys or payload. `PushLogoutTests` covers scoped and repeated removal,
  compatibility, validation, first-password/online-off access and a database deletion failure that
  preserves the cookie for manual retry.
- `OnlineOrderingTests` also covers the 30-day contact cleanup (strictly older, own restaurant only,
  rolled back with a rejected submission) and the status link's 24-hour limit after expiry, rejection
  and closure, while an active order keeps its link.
- `OnlineConcurrencyTests`: cross-midnight retries after commit or rollback; the cap across midnight
  and independent restaurant locks; rejection waiting past expiry; acceptance racing service disable
  (including expiry while waiting) and suspension, with both lock acquisition orders.
- Abuse protection: `OnlineAbuseTests` covers independent rate budgets, invalid attempts, cookies,
  concurrent browser/IP slots, recovery, number rollback and slot release.
- Frontend: `tests/online.test.ts` (phone, time inputs, week validation, banner, countdown on
  the server's clock, progress, session labels), `tests/kitchen.test.ts` (shared freshness for writes
  and ringing), `tests/navigation.test.ts`,
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
  history labels with a 30-character name, checkout of a pickup order, and closing one as not
  collected with the history filter.
