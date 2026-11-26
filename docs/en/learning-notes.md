# Learn the full stack by following an order

[中文](../zh-CN/learning-notes.md) · [Italiano](../it/learning-notes.md)

Suppose you know how processes, network requests and relational tables work, and you are opening your first full-stack project. A customer taps Submit on a phone. Some time later, a dish appears in the kitchen. What happened in between? Draw three columns on paper for the browser, HTTP API and PostgreSQL. After each chapter, add a message, a state transition or a recovery path.

The Chinese edition is the source for this course. The examples use TavoloFlow’s ASP.NET Core 10, EF Core 10, PostgreSQL 18, React 19, TanStack Query v5 and Router v1. Check the dependencies and lockfile for exact versions. To try them, start Demo Ramen using the [local development guide](local-development.md). Follow its online ordering walkthrough to enable the service and set hours that include the current time. You can also work through the scenarios on paper with the source and tests.

## Reading order

| Step | Chapter | What you should be able to do from memory |
| --- | --- | --- |
| 1 | [HTTP and a single order](learning/01-http.md) | Draw the message sequence for a first submission, a duplicate and a lost response. |
| 2 | [ASP.NET Core and application layers](learning/02-aspnet-core.md) | Place a new business rule and explain who constructs its dependencies. |
| 3 | [EF Core and relational databases](learning/03-ef-core.md) | Sketch the SQL behind a query and explain when objects and rows can differ. |
| 4 | [Transactions, concurrency and idempotency](learning/04-concurrency.md) | Trace two competing requests and show why the protection works. |
| 5 | [React and browser state](learning/05-react.md) | Predict the UI after a render, an asynchronous event and a background refresh. |
| 6 | [TanStack Query and server data](learning/06-query.md) | Design keys for different accounts and predict when cached data appears or a GET runs. |
| 7 | [TanStack Router and URLs](learning/07-router.md) | Decide which choices belong in a URL and what survives reload, Back and a restaurant switch. |
| 8 | [Identity, testing and runtime environments](learning/08-runtime.md) | Locate authorization for an operation and choose the test that demonstrates it. |

On a first pass, group chapters 1–2, 3–4, 5–7, then 8. Each time, take a successful case, change one condition and **write down your prediction before reading the code or running a test**. Test names and assertions often give you a quicker start than constructors. For the whole restaurant workflow, find `AcceptedSession_UsesTheExistingKitchenPassAndBillPaths`. Follow acceptance, kitchen processing and billing, then return to the customer’s submission. [OnlineStaffTests.cs](../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## Find the question you are working on

| Question while reading the code | Start here |
| --- | --- |
| Does the controller handle HTTP while the service owns the business logic? | [Responsibilities in Submit](learning/02-aspnet-core.md#controller-service) |
| Why read the database again after saving delivery settings? | [Tracking and direct updates](learning/03-ef-core.md#tracking) |
| Why can two devices defeat a disabled button? | [Two submissions with the same ID](learning/04-concurrency.md#two-submissions) |
| Why does my draft dish name survive a menu refresh? | [Editing a draft](learning/05-react.md#draft) |
| Why fetch when I return to a cached kitchen screen? | [Cache lifecycle](learning/06-query.md#cache) |
| Why is the cart still there after I leave checkout? | [Nested routes and component lifetime](learning/07-router.md#nested) |
| Why might a signed-in user lack access to a bill? | [Identity, permission and ownership](learning/08-runtime.md#identity) |

## Interview practice for Italy

These exercises target junior .NET, React and full-stack roles in Italy. Local employers list ASP.NET Web API, ORMs, SQL, React, TypeScript and Git. Databases, frameworks and interview formats vary. These requirements inform the choice of exercises. The sample is too small to rank questions by frequency. [Blumatica careers](https://www.blumatica.it/azienda/lavora-con-noi/) · [Trinaware junior roles](https://www.trinaware.it/azienda/lavora-con-noi)

| Topic to practise aloud | Italian questions and model answers |
| --- | --- |
| HTTP semantics and timeout recovery | [Chapter 1](learning/01-http.md#interview) |
| Controllers, services and DI | [Chapter 2](learning/02-aspnet-core.md#interview) |
| ORMs, SQL and indexes | [Chapter 3](learning/03-ef-core.md#interview) |
| Concurrency, idempotency and transactions | [Chapter 4](learning/04-concurrency.md#interview) |
| Render snapshots, effects and events | [Chapter 5](learning/05-react.md#interview) |
| Server state and cache consistency | [Chapter 6](learning/06-query.md#interview) |
| URL state and nested routes | [Chapter 7](learning/07-router.md#interview) |
| Authentication, authorization and integration tests | [Chapter 8](learning/08-runtime.md#interview) |

**Try a mock interview without looking at the answer.** *Il cliente preme due volte “Ordina” e la prima risposta va persa. Come eviti di creare due ordini?* Give yourself one minute, then draw two POSTs and a recovery GET. Did you mention the original request ID, database uniqueness, notification after commit and what an early unsuccessful GET can tell you? When the customer sees “received”, does the kitchen already have an order? [Submission and acceptance contract](../reference/online-ordering.md)
