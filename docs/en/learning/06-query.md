# 6. TanStack Query and server data

Home and Kitchen both need the current staff identity. If each component fetches in an effect, tracks loading and caches a result, who clears it at logout? Which identity should appear if an old GET completes after a new login? TanStack Query manages asynchronously obtained, shared copies of data that can go stale.

## How a query key connects components

`QueryClient` manages the cache. A query key identifies a shareable result and `queryFn` describes how to retrieve it. Through `useQuery` components observe the entry and receive data, errors and fetching status. Changes notify the relevant observers. On one client, concurrent reads for the same key can usually share the in-flight request. Reads separated in time can still lead to separate network calls. [Query keys](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys) · [query-client.ts](../../../frontend/src/lib/query-client.ts)

The kitchen base key is `["kitchen", restaurantId, userId]`, extended with queue status. Changing any of these inputs selects another result. With `useInfiniteQuery`, the cursor travels as `pageParam` and pages belong to the same list entry. Leaving a result-changing parameter out of the key can mix two views. Staff identity has the shared key `["auth","me"]`. On identity changes the app cancels and removes private staff queries and replaces the identity result. Cache partitioning keeps screens consistent, while the API authorizes access. [useKitchen.ts](../../../frontend/src/features/kitchen/useKitchen.ts) · [store-views.ts](../../../frontend/src/lib/store-views.ts) · [queries.ts](../../../frontend/src/features/accounts/queries.ts)

<a id="cache"></a>

## A cache entry over time

Assume an enabled query using project defaults and an online screen.

| Time | What is cached | What the user can see |
| --- | --- | --- |
| T0 First mount | No data under this key, GET begins | Initial loading indicator. |
| T1 GET returns | Store result and notify subscribers. With `staleTime: 0` it can immediately count as stale. | Data appears. The setting does not start an infinite loop of GETs. |
| T2 Return to the app | Refocus and similar events can trigger a background read when conditions allow | Old content remains visible alongside sync status. `isFetching` can be true while data exists. |
| T3 Last observer unmounts | Inactive entry remains available for reuse | A remount may show cached data before refetching. |
| T4 Unused beyond retention time | Entry can be garbage-collected | Next visit may start at T0. In v5 the browser default `gcTime` is five minutes. |

`staleTime` controls how long data counts as fresh. `gcTime` controls how long unused data can remain. Polling determines when to read periodically. Browser defaults also allow retrying failed queries. TavoloFlow explicitly sets `queries.retry: false` and retains refetch on focus and reconnect. Kitchen polls every ten seconds in the foreground, stops in the background, and requires a poll after resumption before showing the screen as synchronized. A successful read describes one instant. Another order can arrive immediately afterwards. [TanStack Query defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults) · [query-client.ts](../../../frontend/src/lib/query-client.ts) · [useKitchen.ts](../../../frontend/src/features/kitchen/useKitchen.ts)

## How other screens learn about a server write

Marking a dish ready changes several views, including kitchen and pass. A mutation performs an action with side effects. Its returned DTO cannot tell the library all the lists that have changed. `invalidateStoreViews` marks matching account and view prefixes stale, allowing active views to refetch. When a response is complete and identity is known, `setQueryData` can replace cached data directly, as after login. Patching several projections manually can be quicker but puts their consistency in the maintainer’s hands. [store-views.ts](../../../frontend/src/lib/store-views.ts) · [queries.ts](../../../frontend/src/features/accounts/queries.ts) · [Query invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)

Trace a race. Account A is editing. Read R1 starts before the save, then write W succeeds. The UI needs the state after W. `refreshAfterWrite` cancels the previous query for that key, verifies A is still current, starts R2 and checks identity again when it finishes. A late “saved” message could otherwise mislead the next user, B. Both the owner of the data and the order in which reads and writes began matter. [queries.ts](../../../frontend/src/features/accounts/queries.ts)

A failed read can be repeated. For a failed write, the response might have been lost and replay could cause another business action. The project chooses `mutations.retry: false` and `networkMode: "always"` so attempted writes can fail promptly without offline queueing for later replay. Customer orders additionally persist their intent and recover with GET. `useMutation` by itself cannot tell whether a database transaction committed or rolled back. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts)

## Exercise and self-check

Sign into the local kitchen screen, filter Network to the queue API and watch the GETs for more than twenty seconds in the foreground. Switch away, then return. In `useKitchen` find `refetchInterval`, `enabled` and `syncIsFresh`. Explain when a request runs and which response counts as synchronized after resuming. The old list can be on screen while an active page obtains a fresh reading.

**Self-check** — Two users at the same restaurant share a tablet. Is restaurant ID alone a sufficient key?

<details>
<summary>Show the answer</summary>

Private data and permissions also depend on the user. Include the account scope and clear old queries when switching. As another thought experiment, imagine keying a form query by the dish name being typed. That would turn a local draft into many separate server queries.

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Perché usare una libreria per i dati del server quando React ha già useState?»** Identify the authoritative data and who manages sharing and refresh after a component unmounts.

*Con useState gestisco bene una bozza locale. Per un elenco condiviso devo anche coordinare richieste simultanee, aggiornamenti in background e invalidazione. Con TanStack Query i componenti osservano una voce identificata da una chiave. In cucina includiamo nella chiave ristorante, utente e stato della coda. Il server conserva il dato autorevole, mentre il client decide quando aggiornare la copia.*

**Follow-up** — Would the owner’s unfinished dish name belong in that same query cache?

**«Qual è la differenza tra staleTime e gcTime?»** Use the example of leaving and returning to Kitchen.

*StaleTime indica per quanto tempo considero fresco un risultato. Scaduto quel periodo, posso ancora mostrarlo e aggiornarlo in background quando si verifica un evento opportuno. GcTime entra in gioco quando nessun componente osserva più quella query e determina per quanto tempo conservarla. Il polling della cucina ha un intervallo separato, legato alla necessità di mostrare nuovi ordini.*

**Follow-up** — Why can the old queue appear instantly with `staleTime` set to zero?

[Course overview](../learning-notes.md) · [Next chapter](07-router.md)
