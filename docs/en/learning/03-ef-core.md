# 3. EF Core and relational databases

A restaurant may have tens of thousands of closed bills, while a screen wants just the first few dozen for one restaurant and date range. Loading an entire table before filtering can produce the right answer at considerable cost in transfers, memory and latency. When reading an EF query, ask where the work happens and when it makes a database round trip.

## From object model to query plan

`ApplicationDbContext` represents a unit of work with the database. A `DbSet` is a starting point for composing queries. Configuration maps properties, relationships, columns, constraints and indexes onto a relational model. Npgsql translates into PostgreSQL SQL. Chaining `Where`, `OrderBy` and `Select` usually builds an `IQueryable` expression. Enumeration or a terminal operation such as `ToArrayAsync`, `SingleOrDefaultAsync` or `LongCountAsync` requests results. After an early `ToList`, subsequent filters on that list run in application memory. [ApplicationDbContext.cs](../../../backend/TavoloFlow.Api/Data/ApplicationDbContext.cs) · [How EF Core executes a query](https://learn.microsoft.com/en-us/ef/core/querying/how-query-works)

`BillQueries.HistoryAsync` restricts `sessions` by tenant, status and time range, counts the matches, then adds a cursor, ordering and `limit + 1` to the page query. This **conceptual SQL** illustrates the access pattern. The real projection also computes the bill summary.

```sql
SELECT id, closed_at
FROM dining_sessions
WHERE restaurant_id = :restaurant
  AND status = 'CLOSED'
  AND closed_at >= :start_utc AND closed_at < :end_utc
  AND (closed_at, id) < (:last_time, :last_id)
ORDER BY closed_at DESC, id DESC
LIMIT :page_size_plus_one;
```

Omit the cursor predicate for the first page. Two bills can close at the same instant, so `id` breaks ties. Fetching one extra row reveals whether another page exists. Searching after the last sort key can use a matching index more effectively than a deep `OFFSET`, but does not naturally jump to arbitrary pages. Count and page share one `RepeatableRead` transaction and snapshot within a single response. The next page is a new HTTP request and transaction. [BillQueries.cs](../../../backend/TavoloFlow.Api/Billing/BillQueries.cs) · [EF Core pagination](https://learn.microsoft.com/en-us/ef/core/querying/pagination)

Projection tells the database which fields or computed values to return. Loading related data row by row can cause N+1 round trips, while eagerly loading every relationship can multiply rows. Start with what the page displays, then choose projection, aggregation or batching. The optimizer chooses an access path using factors such as index column order, selectivity and data volume. Inspect `ToQueryString()` before execution and try `EXPLAIN (ANALYZE, BUFFERS)` on read-only SQL in a local database. Time, row count and round trips measure different costs. [Efficient querying with EF Core](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying) · [PostgreSQL query plans](https://www.postgresql.org/docs/18/using-explain.html)

<a id="tracking"></a>

## Why read again after a save?

| Operation | At the database | In this DbContext |
| --- | --- | --- |
| Tracking query | Executes SELECT | Tracks identity and state. EF can reuse an instance on another query for its primary key. |
| `AsNoTracking` query | Also executes SELECT | Returns values as read, useful for display or responses. Transaction isolation is configured separately. |
| Modify a tracked entity and call `SaveChangesAsync` | Applies pending changes | EF determines writes from tracked state and updates it on success. |
| `ExecuteUpdateAsync` | Immediately executes a set-based UPDATE | Bypasses change tracking. Loaded objects can retain old values. |

`OnlineSettingsService.SetDeliveryAsync` uses both writing styles. In one transaction it locks the restaurant, directly updates delivery properties and replaces fee bands. `ResponseAsync(restaurantId, …)` reads the restaurant without tracking and builds the response before commit. Returning the object originally locked could report delivery as disabled after the database enabled it. Copying every changed property by hand would be easy to get wrong when adding a field. One extra read gives a response consistent with the saved values. [OnlineSettingsService.cs](../../../backend/TavoloFlow.Api/Online/OnlineSettingsService.cs) · [EF Core change tracking](https://learn.microsoft.com/en-us/ef/core/change-tracking/) · [Set-based updates in EF Core](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)

## Business rules in the schema

A primary key gives a row stable identity. A foreign key requires its target to exist. The dish-to-category composite foreign key includes the restaurant ID, so the database rejects references across restaurants even when both rows exist. `client_request_id` is unique within a restaurant across concurrent writers. Ordinary indexes speed up access, while unique indexes also enforce an at-most-one rule. Every index consumes space and costs work on writes. [MenuItemConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/MenuItemConfiguration.cs) · [OnlineRequestConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

A migration records how to evolve an existing database. Editing an entity, generating a migration and applying it are separate actions. Changes to existing data semantics may require a backfill. CI checks the EF model against the migration snapshot. Integration tests apply real migrations to temporary PostgreSQL. Production applies migrations explicitly, so restarting the API does not modify the schema. [Migrations](../../../backend/TavoloFlow.Api/Data/Migrations/) · [Release guide](../releasing.md)

## Exercise and self-check

In `HistoryAsync` mark `Where`, `LongCountAsync`, `Take` and `ToArrayAsync`. Does adding a predicate introduce a round trip? Composition executes no SQL of its own. Count and page retrieval are two execution points. Now consider three bills closed at the same instant. If a page boundary falls between them and the next predicate uses only “earlier than the last time”, it can skip the remaining ties.

**Self-check** — Does adding `AsNoTracking` solve every slow query?

<details>
<summary>Show the answer</summary>

It reduces tracking overhead. Missing filters, inefficient sorting or excess rows transferred still require examining the SQL, indexes and projection.

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Quando viene eseguita una query con Entity Framework Core?»** Explain composition, execution and materialization.

*Con IQueryable descrivo la query per passi. Quando chiamo per esempio ToArrayAsync, il provider traduce l’espressione supportata in SQL e legge i risultati. Nello storico applichiamo prima i filtri del ristorante e del periodo. Se materializzassi subito tutta la tabella, i filtri successivi lavorerebbero in memoria e trasferirei molte più righe.*

**Follow-up** — How many executions if `LongCountAsync` and `ToArrayAsync` use the same query variable?

**«A cosa serve un indice e come verifichi che una query ne tragga vantaggio?»** Start from the access pattern and explain the benefits, costs and how to verify them.

*Parto dai filtri e dall’ordinamento reali. Un indice coerente con questi criteri può ridurre le righe da esaminare, ma occupa spazio e va aggiornato a ogni scrittura interessata. Controllo il piano di esecuzione e provo con dati rappresentativi. Per lo storico considero anche il secondo campo di ordinamento, così la paginazione rimane deterministica a parità di data.*

**Follow-up** — Does a fast index lookup guarantee unique request IDs? Distinguish ordinary and unique indexes.

[Course overview](../learning-notes.md) · [Next chapter](04-concurrency.md)
