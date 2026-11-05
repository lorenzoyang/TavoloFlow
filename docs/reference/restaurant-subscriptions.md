# Restaurant subscriptions

Platform administrators manage owner contact information, the default annual fee and agreed service
periods. OWNER reads only their own restaurant at `/staff/subscription`. STAFF and Guest receive no
contact/subscription data; this information is absent from `/api/auth/me` and public bootstrap.
The system records offline fee collection, not payment processing. There is no change-history table,
owner inbox or persistent notification workflow.

## APIs and response shape

Platform subscription paths are relative to `/api/platform/restaurants/{id}/subscription`:

| Method | Relative path                 | Input / purpose                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------ |
| GET    | Empty                         | `{ summary, periods }`                                                   |
| PATCH  | Empty                         | `{ expectedVersion, ownerContact, defaultAnnualFeeCents }`               |
| POST   | `/periods`                    | `{ expectedVersion, id, startsOn, endsOn, years, amountCents, paidOn? }` |
| PATCH  | `/periods/{periodId}`         | `{ expectedVersion, startsOn, endsOn, years, amountCents }`, unpaid only |
| PATCH  | `/periods/{periodId}/expiry`  | `{ expectedVersion, endsOn }`                                            |
| POST   | `/periods/{periodId}/payment` | `{ expectedVersion, paidOn }`, confirm full collection                   |

OWNER uses `GET /api/owner/subscription`, with restaurant derived from `CurrentAccount`.
`GET /api/platform/subscription-reminders` returns `dueSoonCount`, `expiredCount` and `unpaidCount`.
Restaurant listing accepts `subscriptionStatus=UNPAID|DUE_SOON|EXPIRED|UNCONFIGURED` and `sort=EXPIRY`.
Writes require Platform CSRF; management DTOs reject unknown fields. Responses are `no-store`.

Summary fields: `ownerContact`, `defaultAnnualFeeCents`, `version`, `serviceState`, `startsOn`,
`expiresOn`, `paymentState`, `unpaidPeriodCount`, `dueSoon` and `localToday`. Each period has `id`,
`startsOn`, `endsOn`, `years`, `amountCents`, nullable `paidOn` and derived `isPaid`.
Reads return summary and all periods in one Repeatable Read snapshot, newest start/ID first, without
paging. The version belongs to the same agreements and amounts the operator sees.

## Dates, agreements and collection

- Dates use the restaurant's local calendar and TimeProvider, not UTC date truncation. Start is
  inclusive and end exclusive: a one-year period starting 2026-11-01 normally ends 2027-11-01.
- The frontend pre-fills calendar years, clamping February 29 to the last February day when needed.
  Administrators can confirm an adjusted end date. Years must be positive and fit the supported
  calendar range; end must be after start. The server does not force an exact anniversary.
- Prices use EUR integer cents within JavaScript's safe-integer range. Default annual fee may be null
  or zero; a period amount must be positive. Contact is optional free text up to 500 characters.
- A new agreement pre-fills annual fee × years, but accepts a negotiated whole-period total. Changing
  the default fee does not rewrite earlier agreements.
- Periods may touch but must not overlap. Renewal adds a period. An unpaid agreement can be edited;
  after collection, amount and payment date are frozen and only the dedicated expiry change is allowed.
- Nullable `paidOn` is the payment-state source. Collection is one full payment per period, optionally
  registered on creation; there is no partial payment, undo or payment-date correction endpoint.
- Payment may be early or late, but not in the restaurant's future. Recording late payment preserves
  original start/end dates. Receipt of money never moves the agreed service period.
- Restaurant creation can include contact, default fee, initial period and payment in the same
  restaurant/account transaction. Existing restaurants without periods remain unconfigured; migration
  does not invent historical agreements or collections. Unpaid restaurants can be created.

## Summaries and reminders

Service states are UNCONFIGURED, UPCOMING, ACTIVE and EXPIRED. Payment state is a separate PAID/UNPAID
dimension for the selected period; unpaid-period count includes every started unpaid period, even one
that already expired.

The summary chooses today's period; otherwise the latest started period, otherwise the first upcoming
one. Subsequent periods starting exactly at its exclusive end extend displayed expiry until the first
gap. A future period across a gap does not hide an expired-service warning before service resumes.
Due-soon applies 1–7 local days before that final exclusive cutoff; on the cutoff date it is expired.

Platform lists/reminder summaries, OWNER subscription pages and owner reminders in store pages refresh
every 60 seconds while visible and online, and on resume/reconnect. Closing the browser sends no
external notification. Expiry or nonpayment only warns: service status, ordering and bill closure
continue to follow the explicit business switches. There is no automatic suspension.

## Concurrency and unknown results

Each subscription write owns a transaction, takes restaurant UPDATE and checks `expectedVersion`.
It increments the version only for an actual change, saves the agreement and returns fresh detail.
An unchanged metadata/agreement/expiry save can succeed without incrementing the version. Therefore,
**at most one state-changing write can consume a version**, not at most one successful HTTP response.
An outdated version returns `409 SUBSCRIPTION_CHANGED`, a target conflict rather than identity failure.

The version is the duplicate guard. A repeated applied write cannot consume its old version again.
Unlike account/restaurant management markers, the browser persists no pending subscription operation.
After timeout, disconnection or leaving the foreground, reread and have the administrator reconcile
current detail before another confirmation. No automatic POST retry or lookup-by-operation-ID exists.
Platform confirmations remain inline regions. Applied writes log actor, restaurant and action type,
not amounts or contact details.

The UI supports Chinese, Italian and English using the shared device preference. Amount formatting
follows interface language, while dates retain restaurant-local semantics. Shared status/period
components read the preference themselves. See [account presentation conventions](accounts-platform.md).

## Verification entry points

Sources: [SubscriptionService](../../backend/TavoloFlow.Api/Platform/SubscriptionService.cs),
[contracts](../../backend/TavoloFlow.Api/Platform/SubscriptionContracts.cs),
[platform controller](../../backend/TavoloFlow.Api/Controllers/PlatformSubscriptionsController.cs),
[owner controller](../../backend/TavoloFlow.Api/Controllers/OwnerSubscriptionController.cs),
[frontend actions](../../frontend/src/features/subscriptions/useSubscriptionActions.ts).

Tests: [subscription integration](../../backend/TavoloFlow.Api.Tests/SubscriptionTests.cs),
[summary calculations](../../backend/TavoloFlow.Api.Tests/SubscriptionSummaryTests.cs) and
[frontend date/money logic](../../frontend/tests/subscription.test.ts).
Manual scenarios: unpaid onboarding, negotiated two-year total, early/late collection, touching renewal,
gaps, changed defaults, paid-period expiry adjustment, concurrent version conflicts, unchanged saves
and lost responses followed by reread/reconfirmation. Use explicit migrations as documented in the
[Italian self-hosting guide](../it/self-hosting.md#le-migrazioni).
