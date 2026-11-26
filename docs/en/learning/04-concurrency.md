# 4. Transactions, concurrency and idempotency

Two staff members on separate tablets see “waiting for acceptance”. Both read genuine data, yet only one decision can take effect. State the **business invariant** before choosing the mechanism to enforce it: a request may produce at most one acceptance outcome.

## Choosing a mechanism for the timescale

| Mechanism | Guarantee | Limitation |
| --- | --- | --- |
| Transaction | Writes commit or roll back together. Isolation determines what other connections see. | Two read-then-write transactions may both read the old state. |
| Unique constraint | The database enforces uniqueness across application instances. | The app must decide whether a duplicate gets the original result or a conflict. |
| Row lock or transaction-level advisory lock | Cooperating writers queue for a resource and can recheck the state after waiting. | Conflicting callers wait. Inconsistent lock order can deadlock. |
| Business version number | Checks whether the state matches what the user confirmed. | A user may take minutes to decide. The check and write must still be atomic at submission. |
| Idempotency key | Relates multiple transmissions of one intent and recovers its original outcome. | Two genuine purchases need different keys even for identical dishes. |

Map ACID to the restaurant. Creating session and order together gives atomicity. Constraints and services maintain consistency. Transactions acting on versions visible to them illustrate isolation. Later requests can read committed records, with durability depending on database persistence settings. PostgreSQL uses MVCC to give ordinary reads a version of the data. At the default Read Committed, each ordinary SELECT sees the committed snapshot at statement start. Repeatable Read gives reads in one transaction a stable snapshot. For competing writes, choose conditional updates, locks or conflict handling according to the invariant. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) · [PostgreSQL explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)

<a id="two-submissions"></a>

## Two customer submissions both carry A

1. Requests X and Y may both miss A outside the transaction. This fast lookup cheaply returns an existing result. A miss is insufficient evidence to create one.
2. X takes the shared restaurant row lock, then the transaction-level submission lock for that restaurant, then allocates the daily number. Inside the lock it checks A again, validates waiting limits, menu, quote and coupon, writes the record and commits.
3. If Y reaches the transaction, X has finished by the time Y gets the same submission lock. Y allocates a number, checks A, finds the record and rolls back its own counter change before returning the original result. If the fast lookup already found A, Y avoids the wait.
4. Only the first successful commit enqueues a push. A rolled-back request therefore never triggers one. There is still a gap between commit and enqueue. Notification is best effort and the persisted waiting list is authoritative.

Why add a restaurant-level lock to a unique index? Browser and IP waiting limits span **different request IDs** and potentially local midnight. The daily counter queues updates to one day’s row and cannot cover a check across two days. Submissions for the restaurant briefly queue, so external verification is performed before this critical section. [OnlineRequestService.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [OnlineRequestConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

## One staff member accepts while another rejects

Two distinct intentions target **the same existing record**. Both staff members can legitimately see WAITING. Acceptance, rejection and expiry times determine the phase. X gets `FOR UPDATE` on the request, rechecks the phase, creates session, order and lines, and commits. Once Y gets the row lock it reads the new phase and gets a conflict. If Y got there first, rejection would stand. A consistent acquisition order reduces cyclic waits. Database-managed row locks work across processes. [OnlineRequestState.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestState.cs) · [OnlineStaffService.cs](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs) · [RowLocks.cs](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [OnlineStaffTests.cs](../../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## The customer asks to pay just as the kitchen cancels a dish

The owner confirms version V and 1,400 cents. A kitchen cancellation then changes the amount and version in one transaction. On receiving the old confirmation, the closure service locks the session, reads the bill, and checks `expectedBillVersion` and confirmed amount. `BILL_CHANGED` lets the UI display the updated bill for a new confirmation. An identical repeat matching a previously successful closure can return the persisted result. The lock covers milliseconds of server work, the version covers the seconds or minutes the owner spends reading. [BillingService.cs](../../../backend/TavoloFlow.Api/Billing/BillingService.cs) · [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

## Exercise and self-check

From the repository root run the command below with the .NET SDK and Docker available. The fixture creates temporary PostgreSQL and applies the project migrations.

```bash
dotnet test TavoloFlow.slnx --filter 'FullyQualifiedName~Submit_ConcurrentRepeats_StoreOneRequest|FullyQualifiedName~AcceptAndReject_Racing_ExactlyOneWins|FullyQualifiedName~Checkout_ConfirmationAndRepeatedRequests_ClosesExactlyOnceWithoutChangingVersion'
```

Predict three outcomes. A maps to one request. Only acceptance or rejection succeeds. A repeated closure preserves the first result. Find which assertions check responses and which check persisted state.

**Self-check** — What if the waiting-limit query moved outside the lock and only the unique request index remained?

<details>
<summary>Show the answer</summary>

Two different IDs could both see the last free slot and both insert. The unique index would still be satisfied.

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Perché una transazione da sola può non bastare contro una race condition?»** Describe the order of the reads, then how you serialize the final decision.

*Due transazioni possono leggere entrambe una richiesta ancora in attesa e prendere decisioni incompatibili. Nel nostro flusso blocchiamo la riga della richiesta prima di decidere. Quando il secondo operatore ottiene il lock, rilegge lo stato e trova la decisione già presa. La transazione serve anche a salvare insieme la decisione, la sessione e le righe dell’ordine.*

**Follow-up** — Why not hold the lock from the moment the page opens? Consider waiting time, disconnects and other staff.

**«Come rendi idempotente la creazione di un ordine?»** Start with the identity of a purchase, then explain recovery after a lost response.

*Il client genera una chiave per il singolo tentativo di acquisto e la conserva prima di inviare il POST. Il server cerca la chiave nel ristorante corretto e, se la trova, restituisce il risultato salvato. Un vincolo univoco protegge i dati e un controllo nella transazione gestisce gli arrivi simultanei. In caso di risposta persa il client può iniziare con una lettura.*

**Follow-up** — Why not use a hash of the dishes instead? The same customer might genuinely want another portion.

[Course overview](../learning-notes.md) · [Next chapter](05-react.md)
