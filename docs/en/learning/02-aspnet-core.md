# 2. ASP.NET Core and application layers

Open `OnlineOrderController.Submit` in your IDE. A few lines start an entire submission. Set a breakpoint on the first line. Routing has already matched the request and its parameters already have values. Some invalid requests never reach it. Understanding what runs on either side of those lines is more useful than memorising attribute names.

<a id="controller-service"></a>

## How the controller and service work together

**The controller accepts HTTP input, the service carries out the use case, and the controller translates the outcome into an HTTP response.** Here `Submit` takes the restaurant `slug` from the path, an `OnlineRequestInput` from JSON and the browser submission context from `HttpContext`. It calls `requests.SubmitAsync` and uses the returned data and `Created` flag to choose 201 or 200. The nearby `Menu` action simply wraps the menu read in a 200 response. [OnlineOrderController.cs](../../../backend/TavoloFlow.Api/Controllers/OnlineOrderController.cs)

Read the two lines below on their own. The first turns HTTP context into use-case input and passes request cancellation down through `ct`. The second chooses the success response the client sees. Follow the first into the service to find pricing and concurrency controls. Follow the second into HTTP integration tests to find the contract for first and repeated submissions.

```csharp
var result = await requests.SubmitAsync(slug, input, browser.Require(HttpContext), ct);
return StatusCode(result.Created ? 201 : 200, result.Response);
```

| What you want to add | Where it belongs and why |
| --- | --- |
| Public URL, request body size, success code | Controller or HTTP configuration. These choices depend on the transport. |
| Whether orders are open, whether confirmed prices are valid, which writes roll back together | The service coordinates the use case and transaction. Other entry points to the same use case need these rules too. |
| Calculating free delivery above a threshold | A domain function can depend only on its inputs. Use cases call it and tests exercise amount boundaries directly. |
| Shared error bodies and CSRF checks | Global filters keep this logic consistent across controllers. |

“Service” has two common meanings. ASP.NET Core’s DI container resolves services such as clocks, database contexts and business objects. `OnlineRequestService` is specifically an application service that coordinates business operations. A controller can depend on several services, and a rule can be shared across submission, staff acceptance and bill adjustments. Look at who owns a rule to understand responsibility. Similar filenames are a navigation aid. [OnlineRequestService.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [OnlineDelivery.cs](../../../backend/TavoloFlow.Api/Online/OnlineDelivery.cs)

## Following a request through the framework

1. At startup, `Program.cs` registers controllers, serialization settings, services and filters, and assembles the pipeline. Registering dependencies and handling an individual request happen at distinct times.
2. Middleware runs in order. A component may call the next one and process its response, or end the request early. The app first handles trusted proxy headers. Business routes are matched before online rate limiting, authentication and authorization. Routing exposes the selected endpoint and its metadata to later stages.
3. Inside MVC an authorization filter can reject writes early. Model binding and the JSON formatter assemble parameters from route, query string and body. `[ApiController]` and the configured invalid-model response handle binding errors. A well-formed order can still contain a sold-out dish.
4. The action invokes the service and returns a result. MVC writes the HTTP response. `ApiExceptionFilter` maps business rejections to error bodies containing `code` and `requestId`. Pipeline-level handling catches unexpected exceptions. The UI can translate the same error code into all three interface languages. [Program.cs](../../../backend/TavoloFlow.Api/Program.cs) · [ApiErrors.cs](../../../backend/TavoloFlow.Api/Common/ApiErrors.cs) · [ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0)

## Dependency injection, object lifetimes and cancellation

If the service opened its own connection, read the system clock and contacted a real verification provider, a test for closing time would need to control all three. Constructor injection states what the class needs. Startup selects its implementations. The app supplies `TimeProvider` and `IOnlineVerification`, so tests can control time and verification results. Concrete business services can be injected directly. An interface is useful where an implementation needs substituting. [Program.cs](../../../backend/TavoloFlow.Api/Program.cs) · [OnlineVerificationTests.cs](../../../backend/TavoloFlow.Api.Tests/OnlineVerificationTests.cs)

| Lifetime | During resolution or a request | How to think about it here |
| --- | --- | --- |
| Transient | New instance per resolution | A short-lived independent object. Other consumers should not depend on it to retain their state. |
| Scoped | Reused within one scope, usually one per web request | `AddDbContext` defaults to this lifetime, so cooperating services can share the context. |
| Singleton | Shared throughout the application container | Requests share the clock and push queue. Mutable shared state needs concurrency control. A singleton must not retain a request’s DbContext. |

DbContext tracks a short unit of data work. Its mutable state makes parallel operations on one instance unsafe. The scope determines reuse and disposal. The transaction boundary depends on which writes must succeed together. `CancellationToken` propagates cancellation to asynchronous I/O. When a caller stops waiting, the business protocol still has to determine whether a commit happened. [DataServiceCollectionExtensions.cs](../../../backend/TavoloFlow.Api/Data/DataServiceCollectionExtensions.cs) · [DbContext configuration and lifetime](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)

## Exercise and self-check

Go to the definition of `SubmitAsync`. Identify who reads browser context, opens the transaction, produces `Created` and chooses the HTTP code. Search for `AddScoped<OnlineRequestService>` to find the wiring. Expect browser context and response codes in the controller, transaction and creation decisions in the service, and registration at startup.

**Self-check** — A new rule requires the pre-discount dishes plus delivery to fit exactly in integer cents. Which entry point would a controller-only check miss?

<details>
<summary>Show the answer</summary>

Staff acceptance must also validate a stored quote. Extract the shared amount rule, let each use case call it once it has trustworthy amounts, and give the customer early feedback in the frontend. [OnlineStaffService.cs](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs)

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Come dividi le responsabilità tra controller e servizio?»** Explain the responsibilities, result and reusable rule for one order.

*Nel controller raccolgo i dati della richiesta e traduco il risultato in una risposta HTTP. Il servizio verifica se il ristorante può accettare la richiesta e coordina le scritture nella stessa transazione. Nel nostro caso restituisce anche se la richiesta è stata creata ora. In questo modo il controller può scegliere tra 201 e 200 e la regola sui prezzi resta riutilizzabile.*

**Follow-up** — Which other use case needs the amount rule? Consider a previously quoted delivery at acceptance.

**«Perché registreresti un DbContext come scoped?»** Cover unit of work, concurrency and disposal.

*Il contesto tiene traccia delle entità caricate durante un’unità di lavoro. Con uno scope per richiesta i servizi che collaborano ricevono lo stesso contesto, che viene poi rilasciato. Condividerlo tra richieste concorrenti mescolerebbe stati diversi e creerebbe problemi di accesso simultaneo. Se devo rendere atomiche più scritture, definisco esplicitamente anche il confine della transazione.*

**Follow-up** — What do simultaneous menu requests share? One container can share a clock, while each request has its own context.

[Course overview](../learning-notes.md) · [Next chapter](03-ef-core.md)
