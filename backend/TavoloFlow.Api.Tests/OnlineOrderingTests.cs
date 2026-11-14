using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

using LockGate = OnlineLockGate;
using Shop = OnlineShop;

public sealed class OnlineOrderingTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    // Monday 16 November 2026, 12:00 in Rome (CET, UTC+1).
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    private static readonly TimeZoneInfo RomeZone = TimeZoneInfo.FindSystemTimeZoneById(
        "Europe/Rome"
    );

    // A local time in Rome in 2026, as the instant the test clock takes.
    private static DateTimeOffset Rome(int month, int day, int hour, int minute = 0) =>
        TimeZoneInfo.ConvertTimeToUtc(new DateTime(2026, month, day, hour, minute, 0), RomeZone);

    [Fact]
    public async Task Bootstrap_StatusFollowsAvailability_AndUnknownLinksAre404()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();

        foreach (var slug in new[] { "nessuno-qui", "UPPER", "a" })
            await AssertErrorAsync(
                await client.GetAsync($"/api/public/r/{slug}/bootstrap"),
                HttpStatusCode.NotFound,
                "ONLINE_LINK_NOT_FOUND"
            );

        var open = await MenuAsync(client, shop.Slug);
        Assert.Equal(OnlineStatus.Open, open.Status);
        Assert.Null(open.NextOpensAt);
        Assert.Equal("+390212345678", open.Restaurant.PublicPhone);
        Assert.Equal(shop.RestaurantId, open.Restaurant.Id);
        Assert.Equal("TERRACOTTA", open.Restaurant.Theme);
        Assert.Contains(open.Menu.Items, x => x.Id == shop.Dish.Id);
        Assert.Contains(open.Menu.OptionGroups, x => x.Id == shop.GroupId);

        host.Clock.Set(Rome(11, 16, 16));
        var closed = await MenuAsync(client, shop.Slug);
        Assert.Equal(OnlineStatus.ClosedHours, closed.Status);
        Assert.Equal(Rome(11, 16, 18).UtcDateTime, closed.NextOpensAt);

        host.Clock.Set(MondayNoon);
        await UpdateRestaurantAsync(
            shop,
            u => u.SetProperty(r => r.OnlinePausedUntil, MondayNoon.UtcDateTime.AddMinutes(5))
        );
        Assert.Equal(OnlineStatus.Paused, (await MenuAsync(client, shop.Slug)).Status);
        await UpdateRestaurantAsync(
            shop,
            u => u.SetProperty(r => r.OnlinePausedUntil, (DateTime?)null)
        );

        // Twenty waiting requests make the restaurant busy for customers and on the settings page.
        await SeedRequestsAsync(shop, MondayNoon.UtcDateTime, 20);
        Assert.Equal(OnlineStatus.Busy, (await MenuAsync(client, shop.Slug)).Status);
        using var staff = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            OnlineStatus.Busy,
            (
                await staff.GetFromJsonAsync<OnlineSettingsResponse>("/api/staff/online/settings")
            )!.Status
        );
        host.Clock.Advance(OnlineRequestService.WaitingTime);
        Assert.Equal(OnlineStatus.Open, (await MenuAsync(client, shop.Slug)).Status);

        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.OnlineEnabled, false));
        var notOffered = await MenuAsync(client, shop.Slug);
        Assert.Equal(OnlineStatus.NotOffered, notOffered.Status);
        Assert.Contains(notOffered.Menu.Items, x => x.Id == shop.Dish.Id);
        await UpdateRestaurantAsync(
            shop,
            u => u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended)
        );
        Assert.Equal(OnlineStatus.Suspended, (await MenuAsync(client, shop.Slug)).Status);
    }

    [Fact]
    public async Task Submit_FirstAndRepeat_NumbersPerLocalDayWithoutGaps()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();
        var first = Guid.NewGuid();

        var created = await SubmitAsync(client, shop, Body(first, shop.Dish));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var response = (await created.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        Assert.Equal(1, response.Number);
        Assert.Equal(43, response.StatusToken.Length);
        Assert.Equal(MondayNoon.UtcDateTime.AddMinutes(10), response.ExpiresAt);

        // A repeat returns the stored result, even after the hours end, and uses no number.
        host.Clock.Set(Rome(11, 16, 16));
        var repeated = await SubmitAsync(client, shop, Body(first, shop.Dish));
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(
            response,
            await repeated.Content.ReadFromJsonAsync<OnlineSubmissionResponse>()
        );
        host.Clock.Set(MondayNoon);

        // A rejected submission uses no number either.
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish, price: 1)),
            HttpStatusCode.Conflict,
            "MENU_CHANGED"
        );
        Assert.Equal(2, await NumberAsync(client, shop, Guid.NewGuid()));
        Assert.Equal(3, await NumberAsync(client, shop, Guid.NewGuid()));

        // Numbers restart on the restaurant's local date: 00:30 on Tuesday in Rome is still Monday in UTC.
        host.Clock.Set(Rome(11, 17, 0, 30));
        var tuesday = Guid.NewGuid();
        Assert.Equal(1, await NumberAsync(client, shop, tuesday));
        await using var db = database.CreateContext();
        var saved = await db.OnlineRequests.SingleAsync(r => r.ClientRequestId == tuesday);
        Assert.Equal(new DateOnly(2026, 11, 17), saved.BusinessDate);
        Assert.Equal(OnlineFulfillment.Pickup, saved.Fulfillment);
        Assert.Equal("Marco Rossi", saved.CustomerName);
        Assert.Equal("+393331234567", saved.CustomerPhone);
        Assert.Equal("it", saved.DefaultLanguageSnapshot);
        Assert.Equal(2400, saved.ItemsTotalCents);
        var line = Assert.Single(saved.Lines);
        Assert.Equal(
            (shop.Dish.Id, 1200L, 2, "Poco brodo"),
            (line.MenuItemId, line.UnitPriceCents, line.Quantity, line.Remark)
        );
        Assert.Empty(line.Options);
        // Submission creates no session, order or order item: only acceptance does.
        Assert.False(await db.DiningSessions.AnyAsync(s => s.RestaurantId == shop.RestaurantId));
        Assert.False(await db.Orders.AnyAsync(o => o.RestaurantId == shop.RestaurantId));
    }

    [Fact]
    public async Task Submit_ConcurrentRepeats_StoreOneRequest()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();
        var id = Guid.NewGuid();
        // One token for every request: concurrent token reads would replace each other's CSRF cookie.
        var csrf = await PublicCsrfAsync(client);
        var responses = await Task.WhenAll(
            Enumerable
                .Range(0, 6)
                .Select(_ =>
                    PostAsync(
                        client,
                        $"/api/public/r/{shop.Slug}/requests",
                        Body(id, shop.Dish),
                        csrf
                    )
                )
        );
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode));
        var bodies = await Task.WhenAll(
            responses.Select(r => r.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())
        );
        Assert.Single(bodies.Distinct());
        await using var db = database.CreateContext();
        Assert.Equal(
            1,
            await db.OnlineRequests.CountAsync(r => r.RestaurantId == shop.RestaurantId)
        );
        Assert.Equal(
            1,
            (
                await db.OnlineCounters.SingleAsync(c => c.RestaurantId == shop.RestaurantId)
            ).LastNumber
        );
    }

    [Fact]
    public async Task Submit_Gates_RejectWithTheirCodes()
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedAsync();
        using var client = host.Browser();

        // The last moment to order is exclusive; the opening minute is inclusive.
        host.Clock.Set(Rome(11, 16, 15));
        var closed = await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish));
        await AssertErrorAsync(closed, HttpStatusCode.Conflict, "ONLINE_CLOSED");
        Assert.Equal(
            Rome(11, 16, 18).UtcDateTime,
            JsonDocument
                .Parse(await closed.Content.ReadAsStringAsync())
                .RootElement.GetProperty("nextOpensAt")
                .GetDateTime()
        );
        host.Clock.Set(Rome(11, 16, 11));
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
        );

        // Summer time: 15:30 in Rome on 29 March is 13:30 UTC, so the 11:00-15:00 slot has ended.
        host.Clock.Set(Rome(3, 29, 15, 30));
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "ONLINE_CLOSED"
        );
        host.Clock.Set(Rome(3, 29, 14, 30));
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
        );

        // A pause lapses on its own.
        host.Clock.Set(MondayNoon);
        await UpdateRestaurantAsync(
            shop,
            u => u.SetProperty(r => r.OnlinePausedUntil, MondayNoon.UtcDateTime.AddMinutes(5))
        );
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "ONLINE_PAUSED"
        );
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
        );

        await AssertErrorAsync(
            await SubmitAsync(
                client,
                shop,
                Body(Guid.NewGuid(), shop.Dish, fulfillment: "DELIVERY", address: "Via Roma 1")
            ),
            HttpStatusCode.Conflict,
            "DELIVERY_NOT_OFFERED"
        );
        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.PublicPhone, (string?)null));
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "ONLINE_NOT_OFFERED"
        );
        await UpdateRestaurantAsync(
            shop,
            u =>
                u.SetProperty(r => r.PublicPhone, "+390212345678")
                    .SetProperty(r => r.OnlineEnabled, false)
        );
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "ONLINE_NOT_OFFERED"
        );
        await UpdateRestaurantAsync(
            shop,
            u =>
                u.SetProperty(r => r.OnlineEnabled, true)
                    .SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended)
        );
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "SERVICE_SUSPENDED"
        );
        await AssertErrorAsync(
            await SubmitAsync(
                client,
                shop with
                {
                    Slug = "link-sconosciuto",
                },
                Body(Guid.NewGuid(), shop.Dish)
            ),
            HttpStatusCode.NotFound,
            "ONLINE_LINK_NOT_FOUND"
        );
    }

    [Fact]
    public async Task Submit_InvalidInput_RejectedBeforeAnyWrite()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();
        var line = new[] { new OrderLineInput(shop.Dish.Id, 1, 1200, null, []) };
        object Input(
            Guid? id = null,
            string? fulfillment = "PICKUP",
            string? name = "Marco",
            string? phone = "3331234567",
            string? address = null,
            OrderLineInput[]? items = null
        ) =>
            new
            {
                clientRequestId = id ?? Guid.NewGuid(),
                fulfillment,
                customerName = name,
                customerPhone = phone,
                deliveryAddress = address,
                items = items ?? line,
            };
        foreach (
            var invalid in new object[]
            {
                new
                {
                    fulfillment = "PICKUP",
                    customerName = "Marco",
                    customerPhone = "3331234567",
                    items = line,
                },
                Input(id: Guid.Empty),
                Input(fulfillment: "TAKEAWAY"),
                Input(fulfillment: "pickup"),
                Input(name: "   "),
                Input(name: new string('M', 31)),
                Input(phone: "12345"),
                Input(phone: "+39-333-1234567"),
                Input(address: "Via Roma 1"),
                Input(fulfillment: "DELIVERY"),
                Input(items: []),
                Input(items: [new OrderLineInput(shop.Dish.Id, 0, 1200, null, [])]),
                Input(items: [new OrderLineInput(shop.Dish.Id, 1, 1200, null, null)]),
                new
                {
                    clientRequestId = Guid.NewGuid(),
                    fulfillment = "PICKUP",
                    customerName = "Marco",
                    customerPhone = "3331234567",
                    items = line,
                    extra = true,
                },
            }
        )
            await AssertErrorAsync(
                await SubmitAsync(client, shop, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        // The anonymous write still needs the public CSRF token.
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/public/r/{shop.Slug}/requests"
        )
        {
            Content = JsonContent.Create(Input()),
        };
        await AssertErrorAsync(
            await client.SendAsync(request),
            HttpStatusCode.BadRequest,
            "CSRF_VALIDATION_FAILED"
        );
        await using var db = database.CreateContext();
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
        Assert.False(await db.OnlineCounters.AnyAsync(c => c.RestaurantId == shop.RestaurantId));
    }

    [Fact]
    public async Task Submit_MenuChanges_UseTheSharedOrderCheck()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();

        async Task<string> Reason(object body)
        {
            var response = await SubmitAsync(client, shop, body);
            await AssertErrorAsync(response, HttpStatusCode.Conflict, "MENU_CHANGED");
            return JsonDocument
                .Parse(await response.Content.ReadAsStringAsync())
                .RootElement.GetProperty("changes")[0]
                .GetProperty("reason")
                .GetString()!;
        }
        Assert.Equal("PRICE_CHANGED", await Reason(Body(Guid.NewGuid(), shop.Dish, price: 1100)));
        // The spicy ramen requires one spice level.
        Assert.Equal(
            "OPTIONS_CHANGED",
            await Reason(Body(Guid.NewGuid(), shop.Spicy, price: 1300))
        );
        Assert.Equal("MISSING", await Reason(Body(Guid.NewGuid(), Guid.NewGuid(), 1300)));

        var withOption = Guid.NewGuid();
        Assert.Equal(
            HttpStatusCode.Created,
            (
                await SubmitAsync(
                    client,
                    shop,
                    Body(withOption, shop.Spicy, price: 1450, optionIds: [shop.HotOptionId])
                )
            ).StatusCode
        );
        await using (var db = database.CreateContext())
        {
            var saved = await db.OnlineRequests.SingleAsync(r => r.ClientRequestId == withOption);
            var line = Assert.Single(saved.Lines);
            Assert.Equal(1450, line.UnitPriceCents);
            Assert.Equal(new[] { "GLUTEN", "SESAME" }, line.AllergenCodes);
            var option = Assert.Single(line.Options);
            Assert.Equal(("Piccante", 150L), (option.NameIt, option.PriceDeltaCents));
            Assert.Equal(2900, saved.ItemsTotalCents);
            await db
                .MenuItems.Where(x => x.Id == shop.Dish.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsAvailable, false));
        }
        Assert.Equal("UNAVAILABLE", await Reason(Body(Guid.NewGuid(), shop.Dish)));
    }

    [Fact]
    public async Task Submit_WaitingCap_CountsOnlyRequestsStillWaiting()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();

        // Twenty expired requests never fill the cap.
        await SeedRequestsAsync(shop, MondayNoon.UtcDateTime.AddMinutes(-10), 20, firstNumber: 100);
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
        );

        await SeedRequestsAsync(shop, MondayNoon.UtcDateTime, 19, firstNumber: 200);
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish)),
            HttpStatusCode.Conflict,
            "ONLINE_BUSY"
        );
        Assert.Equal(OnlineStatus.Busy, (await MenuAsync(client, shop.Slug)).Status);

        // A decided request stops counting.
        await using (var db = database.CreateContext())
            await db
                .OnlineRequests.Where(r => r.RestaurantId == shop.RestaurantId && r.Number == 200)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.RejectedAt, MondayNoon.UtcDateTime));
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
        );
    }

    [Fact]
    public async Task Submit_RateLimit_PerIp()
    {
        using var host = new AccountTestHost(database, lowLimits: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();
        for (var i = 0; i < 3; i++)
            Assert.Equal(
                HttpStatusCode.Created,
                (await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish))).StatusCode
            );
        var limited = await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish));
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.NotNull(limited.Headers.RetryAfter);
    }

    [Fact]
    public async Task Recovery_ByClientRequestId_FindsOnlyThatRestaurantsRequest()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        var other = await SeedAsync();
        using var client = host.Browser();
        var id = Guid.NewGuid();
        var path = $"/api/public/r/{shop.Slug}/requests/by-client-id/{id}";

        await AssertErrorAsync(
            await client.GetAsync(path),
            HttpStatusCode.NotFound,
            "ONLINE_REQUEST_NOT_FOUND"
        );
        var submitted = await (
            await SubmitAsync(client, shop, Body(id, shop.Dish))
        ).Content.ReadFromJsonAsync<OnlineSubmissionResponse>();
        Assert.Equal(submitted, await client.GetFromJsonAsync<OnlineSubmissionResponse>(path));
        await AssertErrorAsync(
            await client.GetAsync($"/api/public/r/{other.Slug}/requests/by-client-id/{id}"),
            HttpStatusCode.NotFound,
            "ONLINE_REQUEST_NOT_FOUND"
        );
        await AssertErrorAsync(
            await client.GetAsync($"/api/public/r/link-sconosciuto/requests/by-client-id/{id}"),
            HttpStatusCode.NotFound,
            "ONLINE_LINK_NOT_FOUND"
        );
    }

    [Fact]
    public async Task Status_EachPhase_ReturnsPublicFieldsOnly()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        using var client = host.Browser();
        var id = Guid.NewGuid();
        var token = (
            await (
                await SubmitAsync(
                    client,
                    shop,
                    Body(id, shop.Spicy, price: 1450, optionIds: [shop.HotOptionId])
                )
            ).Content.ReadFromJsonAsync<OnlineSubmissionResponse>()
        )!.StatusToken;
        var path = $"/api/public/online-orders/{token}";

        var raw = await client.GetStringAsync(path);
        // Never the customer's phone, an address, or any request or session ID.
        Assert.DoesNotContain("3331234567", raw);
        Assert.DoesNotContain(id.ToString(), raw);
        Assert.DoesNotContain("Phone\"", raw.Replace("publicPhone\"", ""));
        Assert.DoesNotContain("address", raw, StringComparison.OrdinalIgnoreCase);
        var waiting = await StatusAsync(client, path);
        Assert.Equal("WAITING", waiting.Phase);
        Assert.Equal(
            (1, "Marco Rossi", "PICKUP"),
            (waiting.Number, waiting.CustomerName, waiting.Fulfillment)
        );
        Assert.Equal(
            (shop.RestaurantId, shop.Slug),
            (waiting.Restaurant.Id, waiting.Restaurant.Slug)
        );
        Assert.Equal("+390212345678", waiting.Restaurant.PublicPhone);
        Assert.Null(waiting.SessionStatus);
        var line = Assert.Single(waiting.Items);
        Assert.Null(line.Status);
        Assert.Equal("Piccante", Assert.Single(line.Options).NameIt);
        Assert.Equal(2900, waiting.TotalAmountCents);

        host.Clock.Advance(OnlineRequestService.WaitingTime);
        Assert.Equal("EXPIRED", (await StatusAsync(client, path)).Phase);

        // Rejection and acceptance arrive with the staff endpoints; here they are written directly.
        var now = host.Clock.GetUtcNow().UtcDateTime;
        var rejected = OnlineTestData.Request(shop.RestaurantId, now, 100);
        rejected.RejectedAt = now;
        rejected.RejectReason = OnlineRejectReason.Busy;
        var silent = OnlineTestData.Request(shop.RestaurantId, now, 101);
        silent.RejectedAt = now;
        var accepted = OnlineTestData.Request(shop.RestaurantId, now, 102, shop.Dish.Id);
        accepted.Lines.Add(OnlineTestData.Line(shop.Dish.Id, 1200, 1));
        accepted.ItemsTotalCents = 3600;
        var session = OnlineTestData.Accept(accepted, now, menuItemExists: true);
        session.Orders.Single().Items.Last().Status = OrderItemStatus.Cancelled;
        session.Orders.Single().Items.Last().CancelledAt = now;
        await using (var db = database.CreateContext())
        {
            db.AddRange(rejected, silent, accepted, session);
            await db.SaveChangesAsync();
        }
        var busy = await StatusAsync(client, $"/api/public/online-orders/{rejected.StatusToken}");
        Assert.Equal(("REJECTED", "BUSY"), (busy.Phase, busy.RejectReason));
        var noReason = await StatusAsync(client, $"/api/public/online-orders/{silent.StatusToken}");
        Assert.Equal(("REJECTED", (string?)null), (noReason.Phase, noReason.RejectReason));

        var acceptedPath = $"/api/public/online-orders/{accepted.StatusToken}";
        var active = await StatusAsync(client, acceptedPath);
        Assert.Equal(
            ("ACCEPTED", "ACTIVE", (string?)null),
            (active.Phase, active.SessionStatus, active.CloseReason)
        );
        Assert.Equal(accepted.EstimatedAt, active.EstimatedAt);
        Assert.Equal(
            new (int, string?)[] { (1, "CANCELLED"), (2, "NEW") },
            active.Items.Select(i => (i.Quantity, i.Status)).Order()
        );
        Assert.Equal(2400, active.TotalAmountCents);

        await using (var db = database.CreateContext())
            await db
                .DiningSessions.Where(s => s.Id == session.Id)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(s => s.Status, DiningSessionStatus.Closed)
                        .SetProperty(s => s.CloseReason, SessionCloseReason.Paid)
                        .SetProperty(s => s.ClosedAt, now.AddMinutes(30))
                        .SetProperty(s => s.ClosedTotalCents, 2400L)
                );
        var paid = await StatusAsync(client, acceptedPath);
        Assert.Equal(
            ("CLOSED", "PAID", 2400L),
            (paid.SessionStatus, paid.CloseReason, paid.TotalAmountCents)
        );

        await AssertErrorAsync(
            await client.GetAsync("/api/public/online-orders/sconosciuto"),
            HttpStatusCode.NotFound,
            "ONLINE_ORDER_NOT_FOUND"
        );
        await AssertErrorAsync(
            await client.GetAsync($"/api/public/online-orders/{new string('a', 129)}"),
            HttpStatusCode.NotFound,
            "ONLINE_ORDER_NOT_FOUND"
        );
    }

    [Fact]
    public async Task Submit_ClearsContactDataOlderThan30Days_OfItsRestaurant()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        var other = await SeedAsync();
        var noon = MondayNoon.UtcDateTime;
        var old = OnlineTestData.Request(shop.RestaurantId, noon.AddDays(-30).AddSeconds(-1), 1);
        old.Fulfillment = OnlineFulfillment.Delivery;
        old.DeliveryAddress = "Via Roma 1";
        old.DeliveryNotes = "Citofono 3";
        var boundary = OnlineTestData.Request(shop.RestaurantId, noon.AddDays(-30), 2);
        var recent = OnlineTestData.Request(shop.RestaurantId, noon.AddDays(-29), 1);
        var foreign = OnlineTestData.Request(other.RestaurantId, noon.AddDays(-31), 1);
        await using (var db = database.CreateContext())
        {
            db.AddRange(old, boundary, recent, foreign);
            await db.SaveChangesAsync();
        }
        using var client = host.Browser();

        // A rejected submission rolls back, cleanup included.
        await AssertErrorAsync(
            await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop.Dish, price: 1)),
            HttpStatusCode.Conflict,
            "MENU_CHANGED"
        );
        await using (var db = database.CreateContext())
            Assert.NotNull(
                (await db.OnlineRequests.SingleAsync(r => r.Id == old.Id)).CustomerPhone
            );

        await NumberAsync(client, shop, Guid.NewGuid());

        await using var check = database.CreateContext();
        var stored = await check.OnlineRequests.AsNoTracking().ToDictionaryAsync(r => r.Id);
        var cleared = stored[old.Id];
        Assert.Equal(
            (null, null, null, null),
            (
                cleared.CustomerName,
                cleared.CustomerPhone,
                cleared.DeliveryAddress,
                cleared.DeliveryNotes
            )
        );
        Assert.Single(cleared.Lines);
        foreach (var kept in new[] { boundary, recent, foreign })
            Assert.Equal(
                ("Marco", "+393331234567"),
                (stored[kept.Id].CustomerName, stored[kept.Id].CustomerPhone)
            );
    }

    [Fact]
    public async Task Status_LinkAnswersUntil24HoursAfterTheOrderEnded()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        var noon = MondayNoon.UtcDateTime;
        var expired = OnlineTestData.Request(shop.RestaurantId, noon, 1);
        var rejected = OnlineTestData.Request(shop.RestaurantId, noon, 2);
        rejected.RejectedAt = noon.AddMinutes(1);
        var active = OnlineTestData.Request(shop.RestaurantId, noon, 3);
        var closed = OnlineTestData.Request(shop.RestaurantId, noon, 4);
        await using (var db = database.CreateContext())
        {
            db.Add(OnlineTestData.Accept(active, noon.AddMinutes(2), menuItemExists: false));
            var session = OnlineTestData.Accept(closed, noon.AddMinutes(2), menuItemExists: false);
            session.Status = DiningSessionStatus.Closed;
            session.ClosedAt = noon.AddMinutes(30);
            session.CloseReason = SessionCloseReason.Paid;
            session.ClosedTotalCents = closed.ItemsTotalCents;
            db.Add(session);
            db.AddRange(expired, rejected, active, closed);
            await db.SaveChangesAsync();
        }
        using var client = host.Browser();
        async Task<HttpStatusCode> At(OnlineRequest request, DateTime when)
        {
            host.Clock.Set(new DateTimeOffset(when, TimeSpan.Zero));
            return (
                await client.GetAsync($"/api/public/online-orders/{request.StatusToken}")
            ).StatusCode;
        }
        var day = OnlineOrderStatusService.LinkLifetime;

        foreach (
            var (request, ended) in new[]
            {
                (expired, noon.AddMinutes(10)),
                (rejected, noon.AddMinutes(1)),
                (closed, noon.AddMinutes(30)),
            }
        )
        {
            Assert.Equal(
                HttpStatusCode.OK,
                await At(request, ended + day - TimeSpan.FromSeconds(1))
            );
            Assert.Equal(HttpStatusCode.NotFound, await At(request, ended + day));
        }
        await AssertErrorAsync(
            await client.GetAsync($"/api/public/online-orders/{expired.StatusToken}"),
            HttpStatusCode.NotFound,
            "ONLINE_ORDER_NOT_FOUND"
        );
        // An order still in progress keeps its link.
        Assert.Equal(HttpStatusCode.OK, await At(active, noon.AddDays(10)));
    }

    // A submission holds restaurant SHARE until it commits; switching online off takes restaurant UPDATE.
    // Whichever locks first, the other sees its result: no request waits once online ordering is off.
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Submit_RacingServicesSwitch_NeverLeavesAWaitingRequestWithOnlineOff(
        bool submitFirst
    )
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedAsync();
        var gate = new LockGate(submitFirst ? "FOR SHARE" : "FOR UPDATE", hold: true);
        var waiting = new LockGate(submitFirst ? "FOR UPDATE" : "FOR SHARE", hold: false);
        await using var firstDb = Intercepted(gate);
        await using var secondDb = Intercepted(waiting);
        var submitDb = submitFirst ? firstDb : secondDb;
        var servicesDb = submitFirst ? secondDb : firstDb;
        async Task<object> Submit() =>
            await new OnlineRequestService(submitDb, host.Clock).SubmitAsync(
                shop.Slug,
                new OnlineRequestInput(
                    Guid.NewGuid(),
                    "PICKUP",
                    "Marco",
                    "3331234567",
                    null,
                    null,
                    [new OrderLineInput(shop.Dish.Id, 1, 1200, null, [])]
                ),
                default
            );
        async Task<object> TurnOff() =>
            await new RestaurantAdministration(
                servicesDb,
                new PasswordHasher<RestaurantUser>(),
                NullLogger<RestaurantAdministration>.Instance,
                new SubscriptionService(
                    servicesDb,
                    host.Clock,
                    NullLogger<SubscriptionService>.Instance
                ),
                host.Clock
            ).SetServicesAsync(shop.RestaurantId, new(true, false), Guid.NewGuid(), default);
        var first = submitFirst ? Submit() : TurnOff();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = submitFirst ? TurnOff() : Submit();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Task.Delay(200);
            Assert.False(second.IsCompleted);
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        await first;
        var error = await Assert.ThrowsAsync<ApiException>(async () => await second!);
        await using var check = database.CreateContext();
        var restaurant = await check.Restaurants.SingleAsync(r => r.Id == shop.RestaurantId);
        var requests = await check.OnlineRequests.CountAsync(r =>
            r.RestaurantId == shop.RestaurantId
        );
        Assert.Equal(submitFirst ? "SERVICE_HAS_OPEN_WORK" : "ONLINE_NOT_OFFERED", error.Code);
        Assert.Equal(submitFirst, restaurant.OnlineEnabled);
        Assert.Equal(submitFirst ? 1 : 0, requests);
    }

    private static object Body(
        Guid id,
        MenuItem dish,
        long? price = null,
        Guid[]? optionIds = null,
        string fulfillment = "PICKUP",
        string? address = null
    ) => Body(id, dish.Id, price ?? dish.PriceCents, optionIds, fulfillment, address);

    private static object Body(
        Guid id,
        Guid dishId,
        long price,
        Guid[]? optionIds = null,
        string fulfillment = "PICKUP",
        string? address = null
    ) =>
        new
        {
            clientRequestId = id,
            fulfillment,
            customerName = "  Marco Rossi ",
            customerPhone = "+39 333 123 4567",
            deliveryAddress = address,
            items = new[] { new OrderLineInput(dishId, 2, price, " Poco brodo ", optionIds ?? []) },
        };

    private static async Task<HttpResponseMessage> SubmitAsync(
        HttpClient client,
        Shop shop,
        object body
    ) =>
        await PostAsync(
            client,
            $"/api/public/r/{shop.Slug}/requests",
            body,
            await PublicCsrfAsync(client)
        );

    private static async Task<int> NumberAsync(HttpClient client, Shop shop, Guid id)
    {
        var response = await SubmitAsync(client, shop, Body(id, shop.Dish));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!.Number;
    }

    private static async Task<OnlineMenuResponse> MenuAsync(HttpClient client, string slug) =>
        (await client.GetFromJsonAsync<OnlineMenuResponse>($"/api/public/r/{slug}/bootstrap"))!;

    private static async Task<OnlineOrderStatusResponse> StatusAsync(
        HttpClient client,
        string path
    ) => (await client.GetFromJsonAsync<OnlineOrderStatusResponse>(path))!;

    private sealed record Csrf(string Token);

    private static async Task<string> PublicCsrfAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;

    private async Task UpdateRestaurantAsync(
        Shop shop,
        Action<Microsoft.EntityFrameworkCore.Query.UpdateSettersBuilder<Restaurant>> update
    )
    {
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == shop.RestaurantId).ExecuteUpdateAsync(update);
    }

    private async Task SeedRequestsAsync(
        Shop shop,
        DateTime submittedAt,
        int count,
        int firstNumber = 500
    )
    {
        await using var db = database.CreateContext();
        db.OnlineRequests.AddRange(
            Enumerable
                .Range(firstNumber, count)
                .Select(number => OnlineTestData.Request(shop.RestaurantId, submittedAt, number))
        );
        await db.SaveChangesAsync();
    }

    private Task<Shop> SeedAsync() => OnlineTestData.SeedShopAsync(database);

    private static Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user) =>
        OnlineTestData.LoginAsync(host, user);

    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) =>
        OnlineTestData.Intercepted(database, interceptor);
}
