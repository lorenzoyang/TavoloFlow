# Temporary data-layer learning notes

Working notes preserved during the documentation consolidation. This is not a standalone specification
or an operations guide. The maintainer may incorporate these topics into
[learning notes](it/learning-notes.md) later. Check the linked code before reusing an example.

## EF Core mapping and defaults

Suggested learning topics: **EF Core: DbContext e mapping** and **EF Core: tracking e transazioni**.

- Entities are mutable sealed persistence classes with reference identity, nullable annotations,
  explicit foreign keys and initialized navigation collections. Controllers return separate DTOs.
- A scoped `ApplicationDbContext` is injected directly into services; there is no generic repository or
  additional unit-of-work abstraction.
- PostgreSQL names are explicitly mapped to snake_case. Enums use uppercase strings in `varchar`
  columns through `UppercaseEnumConverter`; menu language codes remain lowercase strings.
- Non-temporal properties with database defaults use `ValueGeneratedNever()`. EF must send an explicit
  `false`, zero or zero-valued enum member instead of treating it as an omitted value and allowing a
  different SQL default to take effect. CLR initializers and SQL defaults must remain aligned.
- Array properties use PostgreSQL `text[]`, including allergen snapshots. Monetary values use `long`
  integer cents; application boundaries additionally enforce JavaScript's safe-integer range.
- Timestamps use UTC `DateTime` and `timestamptz`; subscription boundaries/payment dates use
  `DateOnly` and `date`. Timestamp columns can have `now()` defaults, but services also explicitly set
  event times through `TimeProvider`. Do not assume every stored timestamp comes from the database.
- UUID keys left to the provider use Npgsql's client-side UUIDv7 generation. Several services explicitly
  generate UUIDv7 values; restaurant and period creation also accept client-generated identifiers.
  Photo IDs are deliberately random UUIDs from `Guid.NewGuid()` and are not provider-generated.
- Categories, menu items and tables have neither creation timestamps nor soft-delete markers. Their
  stable ID ordering is not an editable display order.

Code: [DbContext](../backend/TavoloFlow.Api/Data/ApplicationDbContext.cs),
[registration](../backend/TavoloFlow.Api/Data/DataServiceCollectionExtensions.cs),
[restaurant defaults](../backend/TavoloFlow.Api/Data/Configurations/RestaurantConfiguration.cs),
[item defaults](../backend/TavoloFlow.Api/Data/Configurations/MenuItemConfiguration.cs),
[enum converter](../backend/TavoloFlow.Api/Data/Configurations/UppercaseEnumConverter.cs),
[photo key](../backend/TavoloFlow.Api/Data/Configurations/MenuItemImageConfiguration.cs).

## Tenant relationships and deletion

Suggested learning topics: **SQL di base**, **EF Core: DbContext e mapping** and
**Lock di riga: FOR SHARE e FOR UPDATE**.

Composite alternate keys and foreign keys tie catalog and service rows to the same restaurant. These
constraints complement authorization; trusted queries must still filter by restaurant identity.

Restaurant ownership, session-to-order and order-to-line relationships cascade in PostgreSQL. A photo
belongs to its menu item through a unique foreign key with cascade deletion; it has no restaurant
column. The item carries `image_id` without a reverse foreign key, so the photo service must update
both tables atomically.

Other composite references use database `NO ACTION` and EF `ClientNoAction`. The historical links
`DiningSession.TableId` and `OrderItem.MenuItemId` can be null while `RestaurantId` stays required.
Direct catalog deletion cannot leave dangling references. Snapshot immutability is enforced by
application services, not by a database ban on UPDATE.

`CatalogDeletionService` owns a transaction for each operation; never wrap it in an outer transaction:

| Operation        | Locks and checks                                             | Changes                                                                |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Delete menu item | Restaurant UPDATE, then item UPDATE; tenant-scoped existence | Null historical item links, then delete the item and cascade its photo |
| Delete table     | Table UPDATE; reject an ACTIVE visit                         | Null CLOSED visits' table links, then delete the table                 |

The result enum contains `Deleted`, `NotFound` and `TableHasActiveSession`; a foreign-tenant ID is
`NotFound`. All snapshots, amounts and restaurant IDs survive catalog deletion. Detachment and deletion
roll back together if either fails. A category must be empty before it can be deleted.

`ExecuteUpdateAsync` and `ExecuteDeleteAsync` execute immediately, without `SaveChanges`, and bypass
EF's ChangeTracker: already tracked objects are not synchronized. Use a fresh scope/context for these
deletion operations, and do not rely
on previously tracked rows afterwards. `RowLocks` requires a transaction owned by its caller.

Code: [catalog deletion](../backend/TavoloFlow.Api/Data/CatalogDeletionService.cs),
[locks](../backend/TavoloFlow.Api/Data/RowLocks.cs),
[session mapping](../backend/TavoloFlow.Api/Data/Configurations/DiningSessionConfiguration.cs),
[order mapping](../backend/TavoloFlow.Api/Data/Configurations/OrderConfiguration.cs),
[line mapping](../backend/TavoloFlow.Api/Data/Configurations/OrderItemConfiguration.cs).

## Permanent restaurant deletion

Suggested learning topic: **EF Core: tracking e transazioni**.

The platform already implements permanent deletion. Its DELETE includes both restaurant ID and
`service_status = 'SUSPENDED'`, so concurrent reactivation cannot slip between a status check and an
unconditional delete. Use the existing service instead of introducing a second deletion path.

PostgreSQL cascades all tenant rows, including subscriptions, photos, active visits and closed history.
Other restaurants and platform users survive. Active visits and unpaid bills do not block deletion.
Missing restaurants return `RESTAURANT_NOT_FOUND`; an existing active restaurant returns
`RESTAURANT_NOT_SUSPENDED`.

Deleting a loaded entity graph with `Remove` can cause EF to issue child deletes before the root and
conflict with internal `NO ACTION` references. The service uses `ExecuteDeleteAsync` instead. This is
an example of why database cascades and tracked graph deletion are not interchangeable.

Code: [RestaurantAdministration.DeleteAsync](../backend/TavoloFlow.Api/Platform/RestaurantAdministration.cs).

## Historical migration constraints

Suggested learning topic: **EF Core: migrazioni**. These are upgrade-specific facts, not instructions
to replay old migrations manually or downgrade production.

| Migration                         | Preserved behavior and recovery limits                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CascadeRestaurantDeletion`       | Changes foreign-key delete actions without purging existing restaurant records                                                                                     |
| `RemoveDiningSessionActors`       | Drops opening/closing account attribution; its Down throws because attribution cannot be reconstructed                                                             |
| `SimplifyCatalogAndCascadeOrders` | Drops catalog timestamps/deletion metadata and cancellation attribution; retains rows, including formerly soft-deleted rows, whose old deletion state is discarded |
| `ItemLevelOrderProcessing`        | Copies old order states/times to lines; partial processing cannot be represented by the old model, so Down throws                                                  |
| `RemoveOrderCancelReason`         | Removes legacy reason text; Down can recreate an empty column, not its old contents                                                                                |
| `AddOrderItemServedAt`            | Adds serving state and stamps pre-existing READY rows with `ready_at` to avoid flooding the new pass queue                                                         |
| `MarkServedAtClosure`             | Stamps closed visits' waiting READY rows with `GREATEST(closed_at, ready_at)`; its data-only Down does not undo the stamps                                         |

`SimplifyCatalogAndCascadeOrders` checks duplicate table labels and non-null item codes before dropping
columns. Conflicts include formerly soft-deleted rows. Resolve duplicates explicitly; the migration
does not rename or purge them. Review formerly deleted rows before deploying that historical upgrade.
Its Down also throws because removed metadata cannot be recovered. An incompatible rollback requires
a pre-upgrade database backup, not an invented inverse migration.

Code: [migration sources](../backend/TavoloFlow.Api/Data/Migrations/).
Operational commands belong in [local development](en/local-development.md) and
[self-hosting](en/self-hosting.md).

## Validation and schema ownership

Suggested learning topics: **Test di integrazione: Testcontainers e WebApplicationFactory** and
**Test di concorrenza**.

EF migrations define the deployed schema. The DBML and diagram are explanatory artifacts; annotations
do not create partial indexes by themselves. Keep migrations and the EF snapshot in version control.
`BillVersion` is a business counter, not an EF concurrency-token property.

Each integration test class using `IClassFixture<PostgreSqlFixture>` gets its own disposable PostgreSQL
18 container. The fixture applies real migrations; upgrade tests can create an additional isolated
database inside that container. Tests never silently fall back to the development database.

Code: [schema tests](../backend/TavoloFlow.Api.Tests/ApplicationDbContextTests.cs),
[fixture](../backend/TavoloFlow.Api.Tests/PostgreSqlFixture.cs),
[upgrade tests](../backend/TavoloFlow.Api.Tests/ItemProcessingMigrationTests.cs).
