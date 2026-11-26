# 8. Identity, testing and runtime environments

A bill ID travels from a URL to the server. The owner asks, “What if someone else knows the ID?” Distinguish the browser page, the person identified by the server and the restaurant that owns the row. Which test would show that these layers work together?

<a id="identity"></a>

## Identity, permissions and data ownership

1. **Authentication** answers “Who does this request represent?” At staff login, the server creates a ticket containing identity claims, protects it using ASP.NET Core Data Protection and sends it in an HttpOnly cookie. Later same-origin requests carry the cookie. After validating the ticket, the server checks account status and credential version in the database so deactivation and credential changes take effect. Persistent Data Protection keys let a restarted instance read still-valid tickets. [StoreAuthentication.cs](../../../backend/TavoloFlow.Api/Accounts/StoreAuthentication.cs)
2. **Authorization** answers “Which action may this identity perform?” Billing requires a staff identity and confirming payment additionally requires OWNER. Accessing a protected endpoint without valid credentials typically gets a 401. An authenticated caller who lacks the required role or policy may get a 403. Hiding a button helps the user, and the server decides whether the operation proceeds. [BillingController.cs](../../../backend/TavoloFlow.Api/Controllers/BillingController.cs)
3. **Data ownership** asks “Whose restaurant does this record belong to?” The service gets the restaurant ID from the verified `CurrentAccount`. Queries and locks include both restaurant and resource IDs. Even two OWNER accounts can only act in their own restaurants. A resource outside the tenant scope can be reported as missing, just like a nonexistent one. [RowLocks.cs](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

One browser may also open a guest QR page and platform administration. The app distinguishes Store, Guest and Platform identities. Public menu reads omit credentials, while public submissions require an antiforgery token and cookie for their scope. A staff login does not grant staff privileges to an anonymous order. `AuthBoundary` observes a cached identity, server policies govern real requests, and different tests cover these responsibilities. [BrowserSecurity.cs](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [api.ts](../../../frontend/src/lib/api.ts)

## Why a login cookie still needs CSRF protection

Browsers can automatically attach cookies according to the destination and cookie policy. A valid ticket proves the request carries that identity’s credentials. For writes the server also expects a request token issued for the current scope. The frontend retrieves the token and sends it in `X-CSRF-TOKEN`. The MVC `CsrfValidationFilter` validates the pair for the applicable methods. `HttpOnly` restricts script access to cookies. `SameSite` restricts some cross-site uses. Authorization checks the specific action. Selecting and binding the correct token scope also matters when staff, guests and platform users share a browser. [BrowserSecurity.cs](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [ASP.NET Core antiforgery](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)

## What evidence does a feature need?

| Claim | Where to look | What the test actually exercises |
| --- | --- | --- |
| After a timeout the cart keeps the original ID and contents. | [Online cart tests](../../../frontend/tests/online-order.test.ts) | Node tests `createOnlineIntent`, serialization, recovery and failure classification with explicit inputs and outputs. |
| Two concurrent submissions create one request. | [Submission integration tests](../../../backend/TavoloFlow.Api.Tests/OnlineOrderingTests.cs) | `WebApplicationFactory` hosts the app, the client sends HTTP and real PostgreSQL enforces migrations, transactions, uniqueness and locks. |
| Rejected or repeated submissions cause no extra notifications. | [Delivery limits and push assertions](../../../backend/TavoloFlow.Api.Tests/OnlineDeliveryQuoteTests.cs) | Real application and database paths use an observable stand-in for external delivery, so timing can be asserted. |
| Back on a phone closes the cart sheet first. | [Local demo](../local-development.md) | Browser interaction exposes history, focus and presentation issues beyond the reach of pure-function tests. |

Choose test doubles around the claim. A controlled clock makes exact expiry repeatable. Fake routing quotes remove the need for external network access. An in-memory collection in place of PostgreSQL cannot demonstrate `FOR UPDATE`, unique indexes or transaction visibility. Read assertions and distinguish three independent claims: the POST succeeded, exactly one row was stored, and the browser displayed the right result. [AccountTestHost.cs](../../../backend/TavoloFlow.Api.Tests/AccountTestHost.cs) · [PostgreSqlFixture.cs](../../../backend/TavoloFlow.Api.Tests/PostgreSqlFixture.cs)

## Following the request from development to deployment

| Environment | How the browser reaches the API | What to investigate |
| --- | --- | --- |
| Local development | Vite serves pages and proxies `/api` to ASP.NET Core. PostgreSQL can run separately under Compose. | Same-origin paths in Network. The dev server gives rapid feedback through hot updates. |
| Local demo | A separate Compose project assembles web, API, database and one-time initialization. | The init task uses migrations and fixtures to reproduce the restaurant. Images package code and dependencies. Volumes retain data across container lifetimes. |
| Production | Vite has built static assets. Caddy terminates TLS, serves files and reverse proxies the API. Kestrel runs the application. | Direct navigation to a business page falls back to the frontend entry, while the API returns its real status. Trusted proxy headers preserve original request information. Persist the database and keys. |
| CI | GitHub Actions runs the agreed checks on pushes and PRs using test processes and a disposable database. | Separate format, type/build, migration consistency and business assertions to locate different regressions. |

Read the Vite proxy and Caddy routing to explain why the same relative API path works in both environments. Production releases apply migrations explicitly. Building the frontend, restarting the API and evolving the schema have independent lifecycles. [vite.config.ts](../../../frontend/vite.config.ts) · [compose.yaml](../../../demo/compose.yaml) · [Caddyfile](../../../deploy/Caddyfile) · [ci.yml](../../../.github/workflows/ci.yml) · [Self-hosting guide](../self-hosting.md)

## Exercise and self-check

Run chapter 4’s backend tests from the repository root. Then run the following with Node 24 from `frontend/`. Find `a saved cart restores only for its restaurant` and `an understood rejection frees the cart` in the output. Open the tests and locate the assertions about preserving the original ID and classifying unknown outcomes.

```bash
node --test --test-isolation=none tests/online-order.test.ts
```

Frontend rule tests can pass without an HTTP server. The lock-contention integration test needs PostgreSQL in Docker.

**Self-check** — Does successful duplicate handling for one restaurant prove another restaurant cannot read its bills?

<details>
<summary>Show the answer</summary>

They exercise different invariants. Use accounts and resources from different restaurants to test query scope. Find `Endpoints_IdentityCsrfAndTenant_RejectUnauthorizedAccess`. [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Qual è la differenza tra autenticazione e autorizzazione in un’applicazione multi-tenant?»** Give concrete checks for identity, permission and ownership of the record.

*L’autenticazione identifica l’utente della richiesta. L’autorizzazione stabilisce se il suo ruolo può compiere l’azione, per esempio chiudere un conto. In un sistema con più ristoranti verifico anche l’appartenenza del dato: ricavo il ristorante dall’identità verificata e lo includo nella query insieme all’identificativo del conto. Due titolari possono avere lo stesso ruolo e accedere a dati diversi.*

**Follow-up** — If the user edits `sessionId` in the frontend, which check still applies?

**«Quando useresti un test di integrazione con un database reale?»** Name the properties that need a real system and the dependencies you can replace.

*Lo uso quando il risultato dipende dal comportamento del database, per esempio da un vincolo univoco o dall’attesa su una riga bloccata. Avvio PostgreSQL in un container temporaneo, applico le migrazioni e invio due richieste attraverso l’API. Verifico sia le risposte sia i dati finali. Per rendere il test ripetibile posso invece controllare l’orologio e sostituire il servizio di notifiche.*

**Follow-up** — If both HTTP calls succeeded, should you still inspect the database? Check the record count and identity of the returned results.

## Model answer for the full-stack interview exercise

Record your own one-minute answer to the course overview’s final question before reading this one. Match each sentence with a frontend or backend test that could support it.

*Prima del POST il browser salva i dati confermati e l’identificativo del tentativo. Se la risposta si perde, il cliente può aver visto un errore anche se il database ha già registrato la richiesta. Al ritorno la pagina cerca il risultato con un GET. Se ancora non lo trova, il primo invio potrebbe essere in corso. Un nuovo tentativo esplicito riusa la stessa chiave. Il server controlla di nuovo dentro la transazione e il vincolo univoco protegge i dati anche con richieste concorrenti. Solo il primo inserimento confermato genera una notifica. A quel punto il ristorante ha ricevuto la richiesta. L’ordine per la cucina nasce quando il personale la accetta.*

If the interviewer asks what happens when two staff members accept simultaneously, turn to row locks and state checks. If they ask when a dish appears in the kitchen, discuss active subscriptions, polling and freshness after resuming. One end-to-end example gives you a path into either database or frontend design.

[Course overview](../learning-notes.md) · [Previous chapter](07-router.md)
