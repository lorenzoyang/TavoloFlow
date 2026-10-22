# Data layer

The nine entity classes live in `backend/TavoloFlow.Api/Entities`. Individual
Fluent API configurations, `ApplicationDbContext`, and EF migrations live in
`backend/TavoloFlow.Api/Data`. A fresh database contains no accounts or sample
records. Development account initialization is an explicit application command;
see [Store accounts](store-accounts.md).

## Local setup

Run these commands from the repository root. Initialize `.env` if needed, replace
its example password, and start PostgreSQL:

```bash
cp .env.example .env
docker compose up -d db
dotnet tool restore
```

Compose's `.env` configures the database container only. Configure the API
separately, using the same database name, username, and password:

```bash
dotnet user-secrets set 'ConnectionStrings:Default' 'Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=YOUR_LOCAL_PASSWORD' --project backend/TavoloFlow.Api
```

Alternatively, supply the standard ASP.NET Core environment variable:

```bash
export ConnectionStrings__Default='Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=YOUR_LOCAL_PASSWORD'
```

Keep real credentials in user secrets, ignored environment files, or deployment
secret configuration. No connection string is committed. Startup fails with a
configuration message when the connection string is missing. The API does not
load `.env` files, seed accounts during normal startup, connect to the database
during registration, or apply migrations at startup. The Development-only
`--seed-dev-accounts` command writes its restaurant and accounts in one transaction
and then exits; migrations must already be applied.

Apply pending migrations explicitly, then start the API:

```bash
dotnet ef database update --project backend/TavoloFlow.Api
dotnet run --project backend/TavoloFlow.Api --launch-profile https
```

EF tooling uses the same application host and configuration as the API; configure
the connection string before running EF commands. Scaffolding migrations and
generating SQL do not require a running database.

## Persistence model

- Entities are mutable sealed classes with reference identity, nullable
  annotations, explicit foreign keys, and initialized navigation collections.
  They are persistence objects; account and menu controllers use separate DTOs.
- UUID primary keys use Npgsql's client-side UUIDv7 generation. Monetary amounts
  are `long` integer cents. Allergen lists map directly to PostgreSQL `text[]`.
- Status and role enums map to the DBML's uppercase strings in `varchar` columns.
  Language codes remain `zh`, `it`, or `en` strings. CLR defaults match SQL
  defaults; non-temporal defaulted properties always send their explicit values
  on insert, including `false` and zero-valued enum members.
- Timestamps use UTC `DateTime` and PostgreSQL `timestamptz`. Creation/opening
  timestamps use database `now()` defaults. Do not supply local or unspecified
  `DateTime` values. Categories, menu items, and tables have no creation timestamps
  or soft-delete markers. Menu queries use ID ordering for a stable order.
- Composite alternate keys and foreign keys enforce same-restaurant
  relationships. Restaurant ownership, session-to-order, and order-to-line
  relationships use `ON DELETE CASCADE`. The remaining composite references use
  database `NO ACTION` and EF `ClientNoAction`. `DiningSession.TableId`/`Table`
  and `OrderItem.MenuItemId`/`MenuItem` are nullable historical links;
  `RestaurantId` is always required.
- A partial unique index enforces one active session per table. Labels are unique
  per restaurant (`uq_tables_label`); non-null item codes are unique per restaurant
  (`uq_menu_items_code`). These values can be reused after physical deletion.
  Order request IDs are unique within each session. QR tokens and
  usernames are globally unique within their respective tables; each restaurant
  has at most one account of each role.
- Row-local checks enforce language/status values, money and quantity bounds,
  positive credential/bill versions, lowercase trimmed restaurant usernames,
  and at least one nonblank translated name. Application inputs should still
  normalize usernames and turn blank optional names/codes into null.
- Session lifecycle checks require a ciphertext while active and closing time,
  reason, and total when closed. Closing clears the ciphertext. Opening and closing
  account IDs are not stored; request authorization still checks the caller's role.
  An active session must reference a table; closed history may have a null table ID.
  Orders require metadata consistent with `NEW`, `READY`, or `CANCELLED`;
  cancellation stores its time and nonblank reason without account attribution,
  and cancellation from `READY` retains `ready_at`. Transition timestamps cannot
  precede creation/opening or appear in reverse order.

The DBML includes the current fields, relationships, and strengthened checks.
`er-diagram.png` is an older export that still shows removed catalog/actor fields;
use the DBML until the image is re-exported. EF migrations define the deployed schema.

## Application responsibilities

`ApplicationDbContext` is scoped and can be injected directly into future
application services. There is no generic repository or unit-of-work wrapper.

Composite foreign keys prevent inconsistent relationships. Authenticated queries
must still include the trusted `RestaurantId` and apply availability conditions.
Historical displays use snapshots and support null table/menu-item navigations.
Snapshots and closed history are not protected against direct updates; application
services must enforce their immutability and authorization.

### Catalog deletion

`CatalogDeletionService` is registered as scoped by `AddDataLayer`. Its
`DeleteMenuItemAsync(restaurantId, menuItemId, cancellationToken)` and
`DeleteRestaurantTableAsync(restaurantId, tableId, cancellationToken)` methods
return `CatalogDeletionResult.Deleted`, `NotFound`, or `TableHasActiveSession`.
IDs belonging to a different restaurant return `NotFound`.

Each operation locks the restaurant-scoped target row
with `FOR UPDATE`. Item deletion clears matching order-line `MenuItemId` values
and deletes the item. Table deletion rejects an active session; otherwise it
clears matching closed sessions' `TableId` values and deletes the table. The
operations retain every snapshot, amount, and `RestaurantId`. Direct deletes of
referenced catalog rows remain blocked by foreign keys. Category deletion requires
removing or moving all its items first.

Use a fresh DI scope/context for each deletion operation. Item deletion joins an
existing EF transaction without committing it, or owns one when called independently.
Table deletion still owns its transaction and must not be wrapped in another one.
These operations execute immediately, without `SaveChanges`;
their bulk statements do not update tracked objects. Opening a table and creating
orders must coordinate using the same table/menu row locks to avoid deletion races.

### Menu transactions and language metadata

`MenuService` implements restaurant-scoped category/item CRUD, availability and
default-language updates without a migration. Each write starts a transaction and
locks the restaurant row first. This serializes menu writers for a restaurant,
including category deletion versus item creation/movement. It then modifies the
content, recalculates available languages from category/item names and repairs an
invalid default before committing. An empty menu retains its current default.
Future workflows taking both restaurant and menu locks must keep that lock order.

Item deletion participates in this transaction, so historical-link detachment,
physical deletion and language repair either all commit or all roll back. Reads
use Repeatable Read to return content and language metadata from one snapshot.
The availability endpoint executes a field-only update; content editing never
accepts or assigns availability. Menu edits use last-write-wins semantics.

The API additionally validates name lengths, same-language descriptions, required
allergen review and the 14 supported codes. Positive integer prices are capped at
9,007,199,254,740,991 cents for safe JSON number transport to JavaScript; the database
remains `bigint`. See [Menu management](menu-management.md).

### Permanent restaurant deletion

Permanently deleting a restaurant removes its OWNER/STAFF accounts, tables,
categories, menu items, dining sessions, orders, and order items. This includes
active sessions, closed bills, and snapshots. Other
restaurants and platform accounts remain independent. Use `SUSPENDED` for a
temporary service interruption that should preserve data.

The future platform-admin deletion operation should use a fresh context and
issue a single restaurant-scoped database DELETE:

```csharp
var deletedCount = await context.Restaurants
    .Where(restaurant => restaurant.Id == restaurantId)
    .ExecuteDeleteAsync(cancellationToken);
```

The statement executes immediately without `SaveChanges`; PostgreSQL cascades
all child deletions atomically. A zero count means the restaurant was absent.
The operation does not load children. Using `Remove` on a partially loaded graph
can make EF issue separate child deletes before the restaurant DELETE, which
can fail against internal references. `ExecuteDeleteAsync` also bypasses the
change tracker, so do not keep using tracked restaurant data after deletion.

Internal `NO ACTION` constraints still reject catalog deletes that leave dangling
references. Deleting a dining session permanently removes its orders and their
lines; deleting an order removes its lines. These cascades work without loading
dependents. Application authorization and retention policies must govern these
permanent operations.

`CascadeRestaurantDeletion` is a forward migration that replaces foreign-key
delete actions without deleting or rewriting existing restaurant records.

Future operations must implement these transaction boundaries:

- Opening and deleting a table acquire the same table row lock and check its
  current state inside the transaction. The active-session unique index is the
  final safeguard against duplicate opening.
- Creating an order, cancelling it, and closing its bill acquire the same dining
  session row lock (`SELECT ... FOR UPDATE`) and verify that it is active. Order
  creation also coordinates menu row reads with price/availability updates.
- Persist the order and all line snapshots, calculate amounts on the server, and
  increment `BillVersion` in the same transaction. A new order or an actual
  cancellation increments it once; a retry or `READY` transition does not.
- Resolve duplicate request IDs by returning the existing order. The unique
  index prevents duplicates but does not implement the retry response itself.
- Update order states conditionally in SQL and inspect affected row counts.
  Checkout recalculates the bill under the session lock and compares the
  confirmed amount and expected bill version before closing. `BillVersion` is a
  business counter, not an EF optimistic-concurrency token.

Store authentication, password hashing, first-password-change enforcement and
credential invalidation are implemented in `Accounts/`, using the existing schema.
Password changes atomically update the hash, clear the first-change flag and
increment the credential version with a conditional database update.
Menu allergen code/review validation is implemented in `Menus/`. Join-code
encryption and ordering/checkout transactions remain subsequent application work. This layer stores
hashes/ciphertext supplied by those services.

## Migrations and validation

`RemoveDiningSessionActors` removes only session opening/closing account IDs and
their foreign keys/indexes, and updates the session lifecycle check. It preserves
session rows and their remaining data. The two earlier migrations are retained.
That migration cannot be downgraded because the removed attribution cannot be
reconstructed; recovering the old schema and attribution requires a database backup.

`SimplifyCatalogAndCascadeOrders` retains all three earlier migrations. It drops
the six catalog timestamp/deletion columns and order cancellation-account column,
makes historical links nullable, and adds the new checks, indexes, and cascades.
All rows and remaining values are preserved, including rows previously marked
as deleted. Their old deletion state is deliberately discarded; review such rows
before deployment. Duplicate table labels or non-null item codes, including old
soft-deleted rows, stop the migration before destructive changes. Resolve conflicts
explicitly and retry; the migration does not purge or rename records. This upgrade
is also forward-only because removed metadata and detached links cannot be recovered.

Keep generated migrations and their model snapshot in source control. To add a
schema change and check for an uncommitted model difference:

```bash
dotnet ef migrations add ChangeName --project backend/TavoloFlow.Api --output-dir Data/Migrations
dotnet ef migrations has-pending-model-changes --project backend/TavoloFlow.Api
```

For deployment, generate and review an idempotent SQL script and apply it as a
separate deployment step using schema-change credentials:

```bash
dotnet ef migrations script --idempotent --project backend/TavoloFlow.Api --output /tmp/tavoloflow-migrations.sql
```

The xUnit integration suite requires Docker. It uses one disposable PostgreSQL
18 container with unique test data and applies the real migrations. It never
uses the API's configured database or the Compose database and does not silently
skip checks when Docker is unavailable.

```bash
dotnet build TavoloFlow.slnx
dotnet test TavoloFlow.slnx
```

Tests cover schema creation/model alignment, graph persistence and explicit
defaults, all five remaining composite tenant relationships, critical
uniqueness/concurrent insert cases, lifecycle checks, snapshot/history
preservation, catalog deletion conflicts and tenant isolation, session/order
cascades with loaded and unloaded dependents, complete restaurant deletion,
and upgrade/preflight checks. Ordering and checkout workflow tests belong with
those future workflows.
