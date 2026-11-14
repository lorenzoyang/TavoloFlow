using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

// Staff decisions on online requests, and accepted online sessions in the kitchen, pass, bill and history.
public sealed class OnlineStaffTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    // Monday 16 November 2026, 12:00 in Rome (CET, UTC+1), inside the shop's 11:00-15:00 slot.
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTime Noon = MondayNoon.UtcDateTime;

    [Fact]
    public async Task Pending_ListsOnlyWaitingRequests_OldestFirst()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var other = await OnlineTestData.SeedShopAsync(database);
        await using (var db = database.CreateContext())
        {
            var later = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-2), 4);
            var earlier = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-5), 3);
            var expired = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-10), 2);
            var rejected = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-1), 5);
            rejected.RejectedAt = Noon.AddSeconds(-30);
            var accepted = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-1), 6);
            db.Add(OnlineTestData.Accept(accepted, Noon.AddSeconds(-20), menuItemExists: false));
            db.AddRange(
                later,
                earlier,
                expired,
                rejected,
                accepted,
                OnlineTestData.Request(other.RestaurantId, Noon, 1)
            );
            await db.SaveChangesAsync();
        }
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);

        var page = await PendingAsync(staff);

        Assert.Equal(Noon, page.Now);
        Assert.Equal(new[] { 3, 4 }, page.Items.Select(r => r.Number));
        var first = page.Items[0];
        Assert.Equal("PICKUP", first.Fulfillment);
        Assert.Equal("Marco", first.CustomerName);
        Assert.Equal("+393331234567", first.CustomerPhone);
        Assert.Equal(Noon.AddMinutes(5), first.ExpiresAt);
        Assert.Equal("it", first.DefaultLanguage);
        Assert.Equal(2400, first.ItemsTotalCents);
        var line = Assert.Single(first.Items);
        Assert.Equal(("Ramen", 2, "Senza cipolla"), (line.NameIt, line.Quantity, line.Remark));
        Assert.Equal("Media", Assert.Single(line.Options).NameIt);
        Assert.Null(line.Status);

        // The accepted one is in progress; nothing else is.
        var active = Assert.Single((await ActiveAsync(staff)).Items);
        Assert.Equal(
            (6, "PICKUP", "+393331234567"),
            (active.Number, active.Channel, active.CustomerPhone)
        );
        Assert.Equal((1, 1, 0), (active.ItemCount, active.NewItemCount, active.ReadyItemCount));

        // A request expires at ExpiresAt exactly.
        host.Clock.Set(MondayNoon.AddMinutes(5));
        Assert.Equal(new[] { 4 }, (await PendingAsync(staff)).Items.Select(r => r.Number));

        using var anonymous = host.Browser();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync("/api/staff/online/pending")).StatusCode
        );
    }

    [Fact]
    public async Task Accept_CreatesSessionOrderAndItems_AtAcceptanceTime()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        using var customer = host.Browser();
        var submitted = await SubmitAsync(customer, shop, shop.Spicy.Id, 1450, [shop.HotOptionId]);
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        var request = Assert.Single((await PendingAsync(staff)).Items);
        host.Clock.Advance(TimeSpan.FromMinutes(3));
        var acceptedAt = Noon.AddMinutes(3);

        var response = await AcceptAsync(staff, request.Id, 20);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accepted = (await response.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>())!;
        Assert.Equal((submitted.Number, "PICKUP"), (accepted.Number, accepted.Channel));
        Assert.Equal(
            (acceptedAt, acceptedAt.AddMinutes(20)),
            (accepted.AcceptedAt, accepted.EstimatedAt)
        );
        Assert.Equal("Marco Rossi", accepted.CustomerName);
        Assert.Equal(
            (1, 1, 0),
            (accepted.ItemCount, accepted.NewItemCount, accepted.ReadyItemCount)
        );

        await using (var db = database.CreateContext())
        {
            var stored = await db.OnlineRequests.SingleAsync(r => r.Id == request.Id);
            Assert.Equal(acceptedAt, stored.AcceptedAt);
            Assert.Equal(acceptedAt.AddMinutes(20), stored.EstimatedAt);
            var session = await db
                .DiningSessions.Include(s => s.Orders)
                    .ThenInclude(o => o.Items)
                .SingleAsync(s => s.Id == stored.SessionId);
            Assert.Equal(SessionChannel.Pickup, session.Channel);
            Assert.Equal(DiningSessionStatus.Active, session.Status);
            Assert.Equal((acceptedAt, 1), (session.OpenedAt, session.BillVersion));
            Assert.Null(session.TableId);
            Assert.Null(session.TableLabelSnapshot);
            Assert.Null(session.JoinCodeCiphertext);
            var order = Assert.Single(session.Orders);
            Assert.Equal(acceptedAt, order.CreatedAt);
            Assert.Equal(stored.ClientRequestId, order.ClientRequestId);
            Assert.Equal((2900L, "it"), (order.TotalAmountCents, order.DefaultLanguageSnapshot));
            var item = Assert.Single(order.Items);
            Assert.Equal(shop.Spicy.Id, item.MenuItemId);
            Assert.Equal(
                (OrderItemStatus.New, 1450L, 2),
                (item.Status, item.UnitPriceCents, item.Quantity)
            );
            Assert.Equal(new[] { "GLUTEN", "SESAME" }, item.AllergenCodesSnapshot.Order());
            Assert.Equal(
                ("Piccantezza", "Piccante", 150L),
                (
                    item.OptionsSnapshot.Single().GroupNameIt,
                    item.OptionsSnapshot.Single().NameIt,
                    item.OptionsSnapshot.Single().PriceDeltaCents
                )
            );
        }

        // It reaches the kitchen now, raises the arrival watermark and is named by its online ticket.
        var kitchen = (await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders?status=NEW"))!;
        Assert.Equal(acceptedAt, kitchen.LatestCreatedAt);
        var ticket = Assert.Single(kitchen.Items);
        Assert.Equal(("PICKUP", null), (ticket.Channel, ticket.TableLabel));
        Assert.Equal(
            new OnlineTicketResponse(submitted.Number, "Marco Rossi", acceptedAt.AddMinutes(20)),
            ticket.Online
        );
        Assert.Empty((await PendingAsync(staff)).Items);
        Assert.Equal(accepted, Assert.Single((await ActiveAsync(staff)).Items));
        var status = (
            await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(
                $"/api/public/online-orders/{submitted.StatusToken}"
            )
        )!;
        Assert.Equal(("ACCEPTED", "ACTIVE"), (status.Phase, status.SessionStatus));
        Assert.Equal("NEW", Assert.Single(status.Items).Status);
    }

    [Fact]
    public async Task Accept_OnlyWhileWaiting_AndIgnoresPauseHoursAndSoldOut()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var other = await OnlineTestData.SeedShopAsync(database);
        var waiting = OnlineTestData.Request(shop.RestaurantId, Noon, 1, shop.Dish.Id);
        var expiring = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-10), 2);
        var lastMoment = OnlineTestData.Request(
            shop.RestaurantId,
            Noon.AddMinutes(-10).AddSeconds(1),
            3
        );
        var delivery = OnlineTestData.Request(shop.RestaurantId, Noon, 4);
        delivery.Fulfillment = OnlineFulfillment.Delivery;
        delivery.DeliveryAddress = "Via Roma 1";
        var foreign = OnlineTestData.Request(other.RestaurantId, Noon, 1);
        await using (var db = database.CreateContext())
        {
            db.AddRange(waiting, expiring, lastMoment, delivery, foreign);
            await db.SaveChangesAsync();
            // Paused, outside the hours and sold out: none of these stops a decision on a valid request.
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlinePausedUntil, Noon.AddHours(5)));
            await db
                .MenuItems.Where(m => m.Id == shop.Dish.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(m => m.IsAvailable, false));
        }
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);

        foreach (var minutes in new[] { 0, 15, 60, -10 })
            await AssertErrorAsync(
                await AcceptAsync(staff, waiting.Id, minutes),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        await AssertErrorAsync(
            await PostAsync(staff, $"/api/staff/online/requests/{waiting.Id}/accept", new { }),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        await AssertErrorAsync(
            await AcceptAsync(staff, expiring.Id, 10),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(staff, lastMoment.Id, 10)).StatusCode);
        await AssertErrorAsync(
            await AcceptAsync(staff, delivery.Id, 30),
            HttpStatusCode.Conflict,
            "DELIVERY_NOT_OFFERED"
        );
        foreach (var missing in new[] { foreign.Id, Guid.NewGuid() })
            await AssertErrorAsync(
                await AcceptAsync(staff, missing, 10),
                HttpStatusCode.NotFound,
                "ONLINE_REQUEST_NOT_FOUND"
            );

        // A suspended restaurant starts no new work, like opening a table.
        await using (var db = database.CreateContext())
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended)
                );
        await AssertErrorAsync(
            await AcceptAsync(staff, waiting.Id, 10),
            HttpStatusCode.Conflict,
            "SERVICE_SUSPENDED"
        );
        await using (var db = database.CreateContext())
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Active)
                );

        host.Clock.Set(MondayNoon.AddHours(4));
        await AssertErrorAsync(
            await AcceptAsync(staff, waiting.Id, 10),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        host.Clock.Set(MondayNoon.AddMinutes(9));
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(staff, waiting.Id, 45)).StatusCode);
        await AssertErrorAsync(
            await AcceptAsync(staff, waiting.Id, 45),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        await AssertErrorAsync(
            await RejectAsync(staff, waiting.Id, null),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
    }

    [Fact]
    public async Task Reject_RecordsOptionalReason_AndIsFinal()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var busy = OnlineTestData.Request(shop.RestaurantId, Noon, 1);
        var silent = OnlineTestData.Request(shop.RestaurantId, Noon, 2);
        var expired = OnlineTestData.Request(shop.RestaurantId, Noon.AddMinutes(-10), 3);
        await using (var db = database.CreateContext())
        {
            db.AddRange(busy, silent, expired);
            await db.SaveChangesAsync();
        }
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var customer = host.Browser();

        foreach (var reason in new[] { "OUT_OF_RANGE", "LATE", "busy" })
            await AssertErrorAsync(
                await RejectAsync(staff, busy.Id, reason),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await RejectAsync(staff, busy.Id, "BUSY")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await RejectAsync(staff, silent.Id, null)).StatusCode
        );
        await AssertErrorAsync(
            await RejectAsync(staff, expired.Id, "CLOSING"),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        await AssertErrorAsync(
            await RejectAsync(staff, busy.Id, "BUSY"),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        await AssertErrorAsync(
            await AcceptAsync(staff, silent.Id, 10),
            HttpStatusCode.Conflict,
            "ONLINE_REQUEST_CHANGED"
        );
        await AssertErrorAsync(
            await RejectAsync(staff, Guid.NewGuid(), null),
            HttpStatusCode.NotFound,
            "ONLINE_REQUEST_NOT_FOUND"
        );

        var status = (
            await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(
                $"/api/public/online-orders/{busy.StatusToken}"
            )
        )!;
        Assert.Equal(("REJECTED", "BUSY"), (status.Phase, status.RejectReason));
        await using var check = database.CreateContext();
        var stored = await check.OnlineRequests.SingleAsync(r => r.Id == silent.Id);
        Assert.Equal((Noon, (OnlineRejectReason?)null), (stored.RejectedAt, stored.RejectReason));
        Assert.Empty((await PendingAsync(staff)).Items);
        Assert.Empty(
            await check
                .DiningSessions.Where(s => s.RestaurantId == shop.RestaurantId)
                .ToArrayAsync()
        );
    }

    // Accept locks the request row after restaurant SHARE; reject is one conditional update of that row.
    // Whichever runs first, the other sees a request that is no longer waiting.
    [Fact]
    public async Task AcceptAndReject_Racing_ExactlyOneWins()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var requests = Enumerable
            .Range(1, 6)
            .Select(n => OnlineTestData.Request(shop.RestaurantId, Noon, n, shop.Dish.Id))
            .ToArray();
        await using (var db = database.CreateContext())
        {
            db.AddRange(requests);
            await db.SaveChangesAsync();
        }
        using var first = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var second = await OnlineTestData.LoginAsync(host, shop.Owner);

        foreach (var request in requests)
        {
            var results = await Task.WhenAll(
                AcceptAsync(first, request.Id, 10),
                RejectAsync(second, request.Id, "SOLD_OUT"),
                AcceptAsync(second, request.Id, 20)
            );
            Assert.Single(results, r => r.IsSuccessStatusCode);
            foreach (var lost in results.Where(r => !r.IsSuccessStatusCode))
                await AssertErrorAsync(lost, HttpStatusCode.Conflict, "ONLINE_REQUEST_CHANGED");
        }
        await using var check = database.CreateContext();
        var stored = await check
            .OnlineRequests.Where(r => r.RestaurantId == shop.RestaurantId)
            .ToArrayAsync();
        Assert.All(stored, r => Assert.True((r.AcceptedAt is null) != (r.RejectedAt is null)));
        Assert.Equal(
            stored.Count(r => r.AcceptedAt is not null),
            await check.DiningSessions.CountAsync(s => s.RestaurantId == shop.RestaurantId)
        );
    }

    // Dish deletion takes restaurant UPDATE, acceptance restaurant SHARE: an accepted line keeps its menu link
    // only while the dish exists, and its snapshot either way.
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Accept_RacingDishDeletion_KeepsTheSnapshot(bool acceptFirst)
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var request = OnlineTestData.Request(shop.RestaurantId, Noon, 1, shop.Dish.Id);
        await using (var db = database.CreateContext())
        {
            db.Add(request);
            await db.SaveChangesAsync();
        }
        var gate = new OnlineLockGate(acceptFirst ? "FOR SHARE" : "FOR UPDATE", hold: true);
        var waiting = new OnlineLockGate(acceptFirst ? "FOR UPDATE" : "FOR SHARE", hold: false);
        await using var firstDb = OnlineTestData.Intercepted(database, gate);
        await using var secondDb = OnlineTestData.Intercepted(database, waiting);
        async Task<object> Accept() =>
            await new OnlineStaffService(acceptFirst ? firstDb : secondDb, host.Clock).AcceptAsync(
                shop.RestaurantId,
                request.Id,
                new OnlineAcceptInput(10),
                default
            );
        async Task<object> Delete() =>
            await new CatalogDeletionService(acceptFirst ? secondDb : firstDb).DeleteMenuItemAsync(
                shop.RestaurantId,
                shop.Dish.Id
            );
        var started = acceptFirst ? Accept() : Delete();
        Task<object>? next = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            next = acceptFirst ? Delete() : Accept();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Task.Delay(200);
            Assert.False(next.IsCompleted);
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        await started;
        await next!;

        await using var check = database.CreateContext();
        var item = await check.OrderItems.SingleAsync(i => i.RestaurantId == shop.RestaurantId);
        Assert.Null(item.MenuItemId);
        Assert.Equal(("Ramen", 1200L), (item.NameItSnapshot, item.UnitPriceCents));
        Assert.False(await check.MenuItems.AnyAsync(m => m.Id == shop.Dish.Id));
    }

    [Fact]
    public async Task AcceptedSession_UsesTheExistingKitchenPassAndBillPaths()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var paid = OnlineTestData.Request(shop.RestaurantId, Noon, 7, shop.Dish.Id);
        var voided = OnlineTestData.Request(shop.RestaurantId, Noon, 8, shop.Dish.Id);
        await using (var db = database.CreateContext())
        {
            db.AddRange(paid, voided);
            await db.SaveChangesAsync();
        }
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(owner, paid.Id, 30)).StatusCode);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(owner, voided.Id, 10)).StatusCode);
        var estimated = Noon.AddMinutes(30);

        // Every ACTIVE session, oldest first, named by its online ticket with the phone for the owner.
        var active = (
            await owner.GetFromJsonAsync<ActiveSessionsPage>("/api/staff/sessions/active")
        )!;
        Assert.Equal(new[] { 7, 8 }, active.Items.Select(s => s.Online!.Number));
        var bill = active.Items[0];
        Assert.Equal(("PICKUP", null, null), (bill.Channel, bill.TableId, bill.TableLabel));
        Assert.Equal(new OnlineBillResponse(7, "Marco", "+393331234567", estimated), bill.Online);
        Assert.Equal((2400L, 1, 1), (bill.TotalAmountCents, bill.OrderCount, bill.NewItemCount));

        var order = (
            await owner.GetFromJsonAsync<BillPage>($"/api/staff/sessions/{bill.SessionId}/bill")
        )!.Orders.Single();
        Assert.Equal(7, order.Online!.Number);
        var itemId = order.Items.Single().Id;
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    owner,
                    $"/api/staff/orders/{order.Id}/items/{itemId}/ready",
                    new { }
                )
            ).StatusCode
        );
        var pass = Assert.Single(
            (await owner.GetFromJsonAsync<PassPage>("/api/staff/pass"))!.Items
        );
        Assert.Equal(("PICKUP", null), (pass.Channel, pass.TableLabel));
        Assert.Equal(new OnlineTicketResponse(7, "Marco", estimated), pass.Online);

        // An online session always has its order, so it can never close as an empty table.
        await AssertErrorAsync(
            await PostAsync(
                owner,
                $"/api/staff/sessions/{bill.SessionId}/close-empty",
                new
                {
                    expectedBillVersion = 1,
                    confirmedTotalCents = 0,
                    guestsLeftConfirmed = true,
                }
            ),
            HttpStatusCode.Conflict,
            "SESSION_HAS_ORDERS"
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    owner,
                    $"/api/owner/sessions/{bill.SessionId}/checkout",
                    new { expectedBillVersion = 1, confirmedTotalCents = 2400 }
                )
            ).StatusCode
        );

        // Cancelling every dish leaves a zero bill that closes as VOIDED.
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        var second = (
            await owner.GetFromJsonAsync<BillPage>(
                $"/api/staff/sessions/{active.Items[1].SessionId}/bill"
            )
        )!.Orders.Single();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    owner,
                    $"/api/staff/orders/{second.Id}/items/{second.Items.Single().Id}/cancel",
                    new { }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    owner,
                    $"/api/staff/sessions/{second.SessionId}/close-void",
                    new
                    {
                        expectedBillVersion = 2,
                        confirmedTotalCents = 0,
                        guestsLeftConfirmed = true,
                    }
                )
            ).StatusCode
        );

        Assert.Empty(
            (await owner.GetFromJsonAsync<ActiveSessionsPage>("/api/staff/sessions/active"))!.Items
        );
        Assert.Empty((await ActiveAsync(owner)).Items);
        var history = (await owner.GetFromJsonAsync<HistoryPage>("/api/owner/history"))!;
        Assert.Equal(
            new[] { ("VOIDED", 8), ("PAID", 7) },
            history.Items.Select(s => (s.CloseReason!, s.Online!.Number))
        );
        Assert.All(history.Items, s => Assert.Null(s.TableLabel));
        using var customer = host.Browser();
        var status = (
            await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(
                $"/api/public/online-orders/{paid.StatusToken}"
            )
        )!;
        Assert.Equal(("CLOSED", "PAID"), (status.SessionStatus, status.CloseReason));
    }

    private static async Task<OnlinePendingPage> PendingAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending"))!;

    private static async Task<OnlineActivePage> ActiveAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<OnlineActivePage>("/api/staff/online/active"))!;

    private static Task<HttpResponseMessage> AcceptAsync(HttpClient client, Guid id, int minutes) =>
        PostAsync(
            client,
            $"/api/staff/online/requests/{id}/accept",
            new { estimatedMinutes = minutes }
        );

    private static Task<HttpResponseMessage> RejectAsync(
        HttpClient client,
        Guid id,
        string? reason
    ) => PostAsync(client, $"/api/staff/online/requests/{id}/reject", new { reason });

    private sealed record Csrf(string Token);

    private static async Task<OnlineSubmissionResponse> SubmitAsync(
        HttpClient client,
        OnlineShop shop,
        Guid dishId,
        long price,
        Guid[] optionIds
    )
    {
        var csrf = (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;
        var response = await PostAsync(
            client,
            $"/api/public/r/{shop.Slug}/requests",
            new
            {
                clientRequestId = Guid.NewGuid(),
                fulfillment = "PICKUP",
                customerName = "Marco Rossi",
                customerPhone = "+39 333 123 4567",
                items = new[] { new OrderLineInput(dishId, 2, price, null, optionIds) },
            },
            csrf
        );
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
    }
}
