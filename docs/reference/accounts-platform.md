# Accounts and platform administration

Store pages use OWNER/STAFF accounts; platform pages use an independent administrator identity.
Guest authorization is described in [dining and ordering](dining-ordering.md). Restaurant fees have a
separate [subscription contract](restaurant-subscriptions.md).

## Identity and security

The default Browser authentication selector forwards by request path:

| Path              | Scheme   | Cookie                                      | Lifetime                             |
| ----------------- | -------- | ------------------------------------------- | ------------------------------------ |
| `/api/platform/*` | Platform | `TavoloFlow.Platform`, Path `/api/platform` | Fixed 30-day persistent ticket       |
| `/api/public/*`   | Guest    | `TavoloFlow.Guest`, Path `/api/public`      | Fixed 12-hour browser-session ticket |
| Other paths       | Store    | `TavoloFlow.Store`, Path `/`                | Fixed 30-day persistent ticket       |

None uses sliding renewal. Cookies are HttpOnly and SameSite=Lax, without a Domain attribute; production
requires Secure, while Development follows the request scheme. All three identities can coexist.
Store and platform principals are checked against active state and credential version on each request.
Guest operations validate the bound visit against current business state. Platform identity does not
grant store permissions.

Every controller write, including login, needs `X-CSRF-TOKEN`. Fetch a fresh token from that identity's
CSRF endpoint before writing. Additional data binds even anonymous tokens to Store, Platform or Guest.
The CSRF cookie is HttpOnly and SameSite=Strict. A token from another scope cannot authorize the write.
Responses use `Cache-Control: no-store`.

Store business endpoints require the first password change to be complete. Only self-account
operations use the weaker StoreAccount policy. OWNER satisfies staff permissions; both tenant and
role come from `CurrentAccount`, never from the request body. Platform administration uses
`CurrentPlatformAccount` instead.

Passwords accept 6–128 characters, including six digits, and cannot be all whitespace. Passwords are
not trimmed; a new password must differ from the current one. Usernames are trimmed and lowercased,
with a maximum of 50 characters. PasswordHasher stores one-way hashes. Password changes update the
hash, first-change flag and credential version in one conditional statement, then issue a new cookie.
Concurrent changes against one version have at most one winner. Other devices' old tickets fail on
their next request. Logout only removes the current browser's cookie; there is no device-session table.

## Account APIs

| Method and path                           | Input                                  | Result                           |
| ----------------------------------------- | -------------------------------------- | -------------------------------- |
| `GET /api/auth/csrf`                      | Anonymous or current Store identity    | `{ token }`                      |
| `POST /api/auth/login`                    | `{ username, password }`               | Store identity and cookie        |
| `GET /api/auth/me`                        | Store cookie                           | Store identity                   |
| `POST /api/auth/change-password`          | `{ currentPassword, newPassword }`     | Store identity and new cookie    |
| `POST /api/auth/logout`                   | No business body                       | 204                              |
| `GET /api/platform/auth/csrf`             | Anonymous or current Platform identity | `{ token }`                      |
| `POST /api/platform/auth/login`           | `{ username, password }`               | Platform identity and cookie     |
| `GET /api/platform/auth/me`               | Platform cookie                        | Platform identity                |
| `POST /api/platform/auth/change-password` | `{ currentPassword, newPassword }`     | Platform identity and new cookie |
| `POST /api/platform/auth/logout`          | No business body                       | 204                              |

Store identity contains `userId`, `username`, `role`, `restaurantId`, `restaurantName`,
`restaurantTheme` and `mustChangePassword`. Platform identity contains `userId`, `username` and
`role: PLATFORM_ADMIN`. Neither contains hashes, tickets, guest codes or subscription/contact data.

Errors share `{ code, message, requestId, errors? }`:

| HTTP/code                                               | Meaning                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| 400 `VALIDATION_FAILED` / `CSRF_VALIDATION_FAILED`      | Invalid input or wrong/expired CSRF token                          |
| 400 `CURRENT_PASSWORD_INCORRECT` / `PASSWORD_UNCHANGED` | Correct the password form                                          |
| 401 `INVALID_CREDENTIALS`                               | Same response for absent, inactive and incorrect-password accounts |
| 401 `UNAUTHENTICATED`                                   | Sign in again                                                      |
| 403 `PASSWORD_CHANGE_REQUIRED` / `FORBIDDEN`            | First change required or insufficient role                         |
| 409 `CREDENTIALS_CHANGED`                               | The current caller's credentials changed; sign in again            |
| 429 `RATE_LIMITED`                                      | Wait for `Retry-After`                                             |

Store limits default to 30 logins/IP/minute, 10/normalized username/five minutes and 5 password
changes/account/minute under `AccountRateLimits`. Platform has its own instance/configuration under
`PlatformRateLimits`. Counts include successful attempts, reset on process restart and are not a
distributed limiter.

## Initialization and account recovery

Apply migrations explicitly before maintenance commands. The [root README](../../README.md) has the
English quick start; the full [local guide](../it/local-development.md) is in Italian. Normal API startup
does not seed accounts or apply migrations.

### Platform bootstrap

Configure `PlatformBootstrap:Username` and `PlatformBootstrap:Password` through local user secrets or
environment variables, then run from the repository root:

```bash
dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-platform-admin
```

The command creates the first platform administrator and exits. Repeating it preserves existing
credentials and active state. Password recovery uses `--reset-platform-password` with the existing
username; it invalidates old credentials without enabling an inactive account. These two commands
also support Production, using the configured production environment; follow the
[self-hosting guide](../it/self-hosting.md) there. There is no anonymous HTTP bootstrap endpoint.
Do not put actual passwords in application arguments, Git or shared terminal output.

### Development store accounts

For a native development database, configure these user-secret keys (or their double-underscore
environment-variable equivalents):

| Key                              | Example or requirement            |
| -------------------------------- | --------------------------------- |
| `DevelopmentSeed:RestaurantId`   | A chosen non-empty UUID           |
| `DevelopmentSeed:RestaurantName` | Your development restaurant name  |
| `DevelopmentSeed:Owner:Username` | `dev.owner`                       |
| `DevelopmentSeed:Owner:Password` | Your local password               |
| `DevelopmentSeed:Staff:Username` | `dev.staff`, different from OWNER |
| `DevelopmentSeed:Staff:Password` | Your local password               |

```bash
dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-dev-accounts
```

This Development-only command writes the restaurant/accounts atomically and exits. It creates a
SUSPENDED restaurant with ordering off and first password change required. Matching restaurant/name/
account ownership on a repeat preserves all existing data, including changed passwords and service
state. Conflicting or incomplete data fails without overwriting it. Use the platform UI to activate
the restaurant, then enable ordering in Floor; direct database edits are not the normal setup path.
For a prepared empty environment, the Docker demo is simpler.

## Restaurant administration APIs

All paths below require Platform except the two OWNER staff endpoints. Management DTOs reject unknown
fields. Temporary passwords appear only in successful create/reset responses, never read responses.

| Method and path                                                     | Input / result                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/platform/restaurants`                                     | `search`, `status`, `subscriptionStatus`, `sort`, `page`, `pageSize` → `{ items, totalCount, page, pageSize }`              |
| `POST /api/platform/restaurants`                                    | Client-chosen `id`, name/language, distinct OWNER/STAFF usernames and optional settings → 201 `{ restaurant, credentials }` |
| `GET /api/platform/restaurants/{id}`                                | `{ restaurant, accounts }`, including account credential versions                                                           |
| `PATCH /api/platform/restaurants/{id}/service-status`               | `{ status: ACTIVE                                                                                                           | SUSPENDED }` → restaurant summary |
| `PATCH /api/platform/restaurants/{id}/google-maps-url`              | `{ googleMapsUrl }`, blank clears → restaurant summary                                                                      |
| `PATCH /api/platform/restaurants/{id}/join-code-required`           | `{ joinCodeRequired }` → restaurant summary                                                                                 |
| `PATCH /api/platform/restaurants/{id}/theme`                        | `{ theme }` → restaurant summary                                                                                            |
| `PATCH /api/platform/restaurants/{id}/users/{userId}/active`        | `{ isActive, expectedCredentialVersion }` → managed account                                                                 |
| `POST /api/platform/restaurants/{id}/users/{userId}/reset-password` | `{ expectedCredentialVersion }` → `{ account, temporaryPassword }`                                                          |
| `DELETE /api/platform/restaurants/{id}`                             | SUSPENDED only → 204                                                                                                        |
| `GET /api/owner/staff`                                              | Trusted owner's restaurant → managed STAFF account                                                                          |
| `POST /api/owner/staff/reset-password`                              | `{ expectedCredentialVersion }` → temporary STAFF credentials                                                               |

List paging defaults to 20, at most 100 per page; `status` is ACTIVE/SUSPENDED. Name search uses a
substring. Subscription filters and expiry sorting are described in
[subscriptions](restaurant-subscriptions.md). Default order is newest creation/ID first.

Creation atomically saves the client-selected UUID, SUSPENDED restaurant, EUR/Europe/Rome defaults,
ordering off and both accounts. Optional settings include `googleMapsUrl`, `joinCodeRequired` (true),
`theme` (TERRACOTTA), `ownerContact`, `defaultAnnualFeeCents` and `initialPeriod`. Initial period/payment
creation shares the transaction. Existing UUIDs return `RESTAURANT_EXISTS`; unique-key races can return
`CREATE_CONFLICT`, with no partial restaurant.

Suspending takes restaurant UPDATE and turns ordering off, coordinating with opening/joining/ordering.
Restoring ACTIVE leaves ordering off. Suspension does not disable accounts or prevent existing kitchen
work and bill closure. Account reset preserves active state; actual active-state changes increment the
credential version. Target-version conflicts are `ACCOUNT_CHANGED`, not a current-caller auth failure.

Permanent deletion is one conditional DELETE with `service_status = 'SUSPENDED'`. PostgreSQL cascades
all tenant data, including photos, subscriptions, active visits and unpaid/closed bills. Active visits
do not block it; the platform cannot close bills itself. Missing/repeated deletion returns
`RESTAURANT_NOT_FOUND` (404); an active restaurant returns `RESTAURANT_NOT_SUSPENDED` (409).
The UI requires the typed restaurant name and an inline consequence confirmation. The application
logs actor, restaurant ID and name; backup copies remain until normal backup retention removes them.

## Presentation settings

Only the platform sets a restaurant theme: TERRACOTTA, LACQUER, INDIGO, INK or TARO. The update changes
only that field, sends the target value and needs no confirmation. Themes affect brand colors only;
state colors, fonts and layout stay shared. `restaurantTheme` in store identity and `restaurant.theme`
in public bootstrap feed `useDocumentTheme` on `<html>`, including portals. Sign-in, first password
change and platform pages keep the default palette.

The optional map URL is platform-only and reserved for a future public restaurant list. It must be an
HTTPS Google Maps link (`maps.app.goo.gl`, `maps.google.*`, or `google.*/maps`), at most 2048 characters.
Store, guest and subscription responses do not expose it. Map/theme writes leave subscription version
unchanged. The join-code switch is also a single-field target-value update, but uses inline confirmation
and waits for guest joins' restaurant SHARE locks. It preserves existing guest grants.

## Frontend state and unknown results

`AuthBoundary` observes the shared identity query; route loaders do not duplicate `/me`. Store query
keys include restaurant/account IDs. Platform uses its own identity, HTTP/CSRF helpers and `platform`
query prefix. Identity changes cancel and clear only the appropriate caches; unrelated guest/public
and other-identity state survives. A background network error is not proof of logout and preserves
forms; an actual auth rejection clears protected data.

Login, password changes and logout have no automatic retry or offline queue. Recheck identity after an
unknown result. Management operations save only scoped identifiers and expected versions before writes;
recovery uses GET. A missing create target does not prove an old request cannot arrive: an explicit
create retry uses the original UUID. A 404 for a non-create marker clears the missing target.
Reset recovery can observe a new version, but cannot retrieve a lost password or prove which actor
changed it. A fresh reset requires another human confirmation against the latest version.

Secret-bearing management writes use direct promises instead of Query/Mutation caches. Temporary
passwords stay in component memory and clear on hiding, navigation, identity change or dismissal.
Pages discard late results after lifecycle/identity changes. Subscription writes use a different
[version-based recovery policy](restaurant-subscriptions.md#concurrency-and-unknown-results).

## Verification entry points

- Backend: [account tests](../../backend/TavoloFlow.Api.Tests/AccountTests.cs),
  [development seeder tests](../../backend/TavoloFlow.Api.Tests/DevelopmentAccountSeederTests.cs),
  [platform identity tests](../../backend/TavoloFlow.Api.Tests/PlatformAccountTests.cs) and
  [management tests](../../backend/TavoloFlow.Api.Tests/PlatformManagementTests.cs).
- Frontend: [platform recovery tests](../../frontend/tests/platform.test.ts),
  [language/query-scope tests](../../frontend/tests/lib.test.ts) and
  [theme tests](../../frontend/tests/theme.test.ts).
- Manual: log into Store and Platform in one browser; change/reset credentials from another device;
  drop create/reset responses and verify GET-only recovery; check deletion confirmation, two-tenant
  isolation and 360px forms in all languages.

Source entry points: [BrowserSecurity](../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs),
[account contracts](../../backend/TavoloFlow.Api/Accounts/AccountContracts.cs),
[administration contracts](../../backend/TavoloFlow.Api/Platform/AdministrationContracts.cs) and
[RestaurantAdministration](../../backend/TavoloFlow.Api/Platform/RestaurantAdministration.cs).
