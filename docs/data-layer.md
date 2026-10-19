# Data layer

The nine entity classes live in `backend/TavoloFlow.Api/Entities`. Individual
Fluent API configurations, `ApplicationDbContext`, and EF migrations live in
`backend/TavoloFlow.Api/Data`. A fresh database contains no accounts or sample
records.

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
dotnet user-secrets set 'ConnectionStrings:DefaultConnection' 'Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=YOUR_LOCAL_PASSWORD' --project backend/TavoloFlow.Api
```

Alternatively, supply the standard ASP.NET Core environment variable:

```bash
export ConnectionStrings__DefaultConnection='Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=YOUR_LOCAL_PASSWORD'
```

Keep real credentials in user secrets, ignored environment files, or deployment
secret configuration. No connection string is committed. Startup fails with a
configuration message when the connection string is missing. The API does not
load `.env` files, seed accounts, connect to the database during registration, or
apply migrations at startup.

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
  They are persistence objects; future controllers should use separate DTOs.
- UUID primary keys use Npgsql's client-side UUIDv7 generation. Monetary amounts
  are `long` integer cents. Allergen lists map directly to PostgreSQL `text[]`.
- Status and role enums map to the DBML's uppercase strings in `varchar` columns.
  Language codes remain `zh`, `it`, or `en` strings. CLR defaults match SQL
  defaults; non-temporal defaulted properties always send their explicit values
  on insert, including `false` and zero-valued enum members.
- Timestamps use UTC `DateTime` and PostgreSQL `timestamptz`. Creation/opening
  timestamps use database `now()` defaults. Do not supply local or unspecified
  `DateTime` values.
- Composite alternate keys and foreign keys enforce same-restaurant
  relationships, including the optional order cancellation actor. The seven direct
  restaurant ownership relationships use `ON DELETE CASCADE`. Internal composite
  references use database `NO ACTION` and EF `ClientNoAction`, preserving
  referenced history when individual records are deleted and preventing EF
  from clearing tracked actor foreign keys.
- Partial unique indexes enforce one active session per table, reusable table
  labels after soft deletion, and reusable non-null menu-item codes after soft
  deletion. Order request IDs are unique within each session. QR tokens and
  usernames are globally unique within their respective tables; each restaurant
  has at most one account of each role.
- Row-local checks enforce language/status values, money and quantity bounds,
  positive credential/bill versions, lowercase trimmed restaurant usernames,
  and at least one nonblank translated name. Application inputs should still
  normalize usernames and turn blank optional names/codes into null.
- Session lifecycle checks require a ciphertext while active and closing time,
  reason, and total when closed. Closing clears the ciphertext. Opening and closing
  account IDs are not stored; request authorization still checks the caller's role.
  Orders require metadata consistent with `NEW`, `READY`, or `CANCELLED`;
  cancellation from `READY` retains `ready_at`. Transition timestamps cannot
  precede creation/opening or appear in reverse order.

The DBML includes the current fields, relationships, and strengthened checks.
`er-diagram.png` is an older export that still shows dining-session actor fields;
use the DBML until the image is re-exported. EF migrations define the deployed schema.

## Application responsibilities

`ApplicationDbContext` is scoped and can be injected directly into future
application services. There is no generic repository or unit-of-work wrapper.

Composite foreign keys prevent inconsistent relationships. They do **not**
authorize access or filter reads. There are deliberately no global tenant or
soft-delete filters: authenticated queries must include the trusted
`RestaurantId`; live menu/table queries must explicitly exclude `DeletedAt`
records and apply the relevant availability conditions. Historical queries use
stored snapshots and may include soft-deleted related records without losing
rows through filtered required navigation joins.

Deleting a table, category, or menu item means setting `DeletedAt` in an
application operation. There is no automatic conversion of `Remove` into soft
deletion. Business operations must coordinate with active sessions and menu
state; foreign keys alone do not enforce those rules. Snapshots and closed
history are preserved by schema relationships while the restaurant exists, but
are not automatically protected against direct updates. Later application
services must enforce their immutability.

### Permanent restaurant deletion

Permanently deleting a restaurant removes its OWNER/STAFF accounts, tables,
categories, menu items, dining sessions, orders, and order items. This includes
active sessions, closed bills, snapshots, and soft-deleted records. Other
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

Internal `NO ACTION` constraints allow the statement's restaurant cascades to
complete while still rejecting individual deletes that leave dangling
references. For example, deleting a staff account referenced as an order's
cancellation actor fails without clearing that actor. Ordinary menu/table soft
deletion remains unchanged. Platform-admin authorization belongs in the future
application operation; cascade configuration does not grant permission.

`CascadeRestaurantDeletion` is a forward migration that replaces foreign-key
delete actions without deleting or rewriting existing restaurant records.

Future operations must implement these transaction boundaries:

- Opening and soft-deleting a table acquire the same table row lock and check its
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

Authentication, password hashing, join-code encryption, credential invalidation,
allergen code/review validation, and these business transactions are subsequent
application work. This layer stores hashes/ciphertext supplied by those services.

## Migrations and validation

`RemoveDiningSessionActors` removes only session opening/closing account IDs and
their foreign keys/indexes, and updates the session lifecycle check. It preserves
session rows and their remaining data. The two earlier migrations are retained.
This migration cannot be downgraded because the removed attribution cannot be
reconstructed; recovering the old schema and attribution requires a database backup.

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
defaults, all six remaining composite tenant relationships, critical
uniqueness/concurrent insert cases, lifecycle checks, snapshot/history
preservation, complete restaurant deletion with tenant/platform isolation, and
an upgrade from the previous schema containing active and closed sessions.
Transactional workflow tests belong with those future workflows.
