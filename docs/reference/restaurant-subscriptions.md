# Restaurant subscriptions

Platform administrators set a restaurant's default monthly fee, record service agreements for any
positive number of calendar months, and confirm offline collection. OWNER can read the restaurant’s
own subscription and acknowledge notices at the staff home. STAFF and guests receive no subscription
or owner-contact data. Collection is recorded in the app and takes place outside it.

## API

Platform subscription paths are relative to `/api/platform/restaurants/{id}/subscription`.

| Method | Relative path          | Input or purpose                                                              |
| ------ | ---------------------- | ----------------------------------------------------------------------------- |
| GET    | Empty                  | `{ summary, periods }`                                                       |
| PATCH  | Empty                  | `{ expectedVersion, ownerContact, defaultMonthlyFeeCents }`                  |
| POST   | `/periods`             | `{ expectedVersion, id, startsOn, months, monthlyFeeCents, paidOn?, reason? }` |
| PATCH  | `/periods/{periodId}`  | `{ expectedVersion, startsOn, months, monthlyFeeCents, reason? }`             |
| POST   | `/periods/{periodId}/payment` | `{ expectedVersion, paidOn, reason? }`                                 |

OWNER reads `GET /api/owner/subscription`, scoped to the authenticated restaurant.
`GET /api/platform/subscription-reminders` returns counts for due-soon, expired and unpaid follow-up.
The platform list accepts `subscriptionStatus=UNPAID|DUE_SOON|EXPIRED|UNCONFIGURED` and `sort=EXPIRY`.
The summary includes the current agreement’s service dates, payment state and a separate renewal
deadline when one needs attention. Every period includes its monthly fee, months, computed end and
total, and its recorded payment date when paid.

Both `/api/owner/subscription/notices` and `/api/platform/subscription-notices` return the
account’s unread notices. `POST .../acknowledge { ids }` marks the displayed IDs as read. It is
idempotent. Acknowledging a notice neither changes an agreement nor records a payment.
Writes use their own account’s CSRF token. Responses are `no-store`.

## Dates, amounts and collection

- An unconfigured restaurant has no recorded period. Its first period defaults to the restaurant’s
  local today. A renewal defaults to the latest agreed end. Start is inclusive and end exclusive.
- The API calculates the end using calendar months and clamps to the last day of a shorter month.
  January 31 plus one month ends on February 28 in a common year. No anchor carries across manual
  renewals. The total is the agreed monthly fee in integer EUR cents multiplied by the month count,
  within JavaScript’s safe-integer range. The default monthly fee is optional.
- Changing the default affects future registrations. An unpaid period can be edited. A change to a
  started agreement requires a reason visible to the owner. After full collection the entire
  agreement is immutable. The actual payment date can be earlier or later than the start and must
  be no later than the restaurant’s local today.
- Periods can touch and cannot overlap. The same model covers one month or multiple months.
  For example, 24 months at €20 totals €480. A restaurant and its first agreement can be created
  together. Changes are written under the restaurant UPDATE lock and the expected subscription
  version. A stale version returns `409 SUBSCRIPTION_CHANGED`. After an unknown result, reread and
  confirm again. No-op saves keep the version and create no notice.

## Notices and follow-up

Registration, changes and payment writes record owner notices in the same transaction as the change.
A paid registration creates one notice. Changes show the prior and saved agreement plus the operator’s
optional note. The owner sees these at staff Home and confirms them once per account.

Agreeing the next service dates and receiving payment remain independent. Unpaid periods still count
after they end. A contiguous paid renewal covers the prior deadline. A contiguous unpaid renewal leaves
that deadline outstanding and shows that renewal is awaiting payment. A gap remains visible until
service resumes. No date or payment automatically suspends the restaurant or changes ordering.

The background task checks at startup and every 30 minutes. It records the first matching phase
from one to seven days before the deadline, and the expired phase on or after the deadline. A unique
key on period, deadline and phase prevents another reminder for the same phase after restarts. Reads
show only the current renewal reminder, so a missed or superseded reminder does not appear beside the
current one. The platform list retains its follow-up counts after notices are read.

Each check that creates reminders attempts one consolidated [admin push](pwa.md#administrator-pwa)
per receiving device. The unread list and follow-up counts remain available if the device has no
permission or push delivery fails.

## Upgrade from annual billing

The monthly migration clears old annual settings and periods under the pre-launch assumption that
these are demo or test records. Verify that assumption and back up the database before upgrading.
Restoring old subscription data requires restoring the corresponding backup. Fresh Demo Ramen starts
without a registered period.

Tests cover [subscription writes](../../backend/TavoloFlow.Api.Tests/SubscriptionTests.cs),
[notices and pushes](../../backend/TavoloFlow.Api.Tests/SubscriptionNoticeTests.cs),
[summary calculations](../../backend/TavoloFlow.Api.Tests/SubscriptionSummaryTests.cs) and
[date and money previews](../../frontend/tests/subscription.test.ts).
