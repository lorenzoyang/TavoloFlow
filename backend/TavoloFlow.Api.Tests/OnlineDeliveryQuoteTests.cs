using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineDeliveryQuoteTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private const string Key = "test-geoapify-key-0123456789";

    // Monday 16 November 2026, 12:00 in Rome: the seeded shop takes online orders until 15:00.
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    private static readonly FakeGeoapifyService.Place Near = new("building", 1, "Prato", 2500);

    private AccountTestHost Host(
        Action<GeoapifyOptions>? geoapify = null,
        bool lowLimits = false,
        bool push = false
    )
    {
        var host = new AccountTestHost(
            database,
            lowLimits: lowLimits,
            push: push,
            geoapify: options =>
            {
                options.ApiKey = Key;
                geoapify?.Invoke(options);
            }
        );
        host.Clock.Set(MondayNoon);
        var places = host.GeoapifyService.Places;
        places["Via Vicina 1"] = Near;
        places["Via Media 2"] = new("amenity", 0.9, "Prato", 6000);
        places["Via Lontana 3"] = new("building", 1, "Campi Bisenzio", 12_000);
        places["Piazza Remota 7, Firenze"] = new("building", 1, "Firenze", 40_000);
        places["Via Remota, Firenze"] = new("street", 1, "Firenze", 40_000);
        places["Via Lunga"] = new("street", 1, "Prato", 2000);
        places["Via Marni 1"] = new("building", 0.33, "Prato", 4000);
        places["Via Senza Punto 4"] = new("building", 1, "Prato", null);
        places["Via Rovescia 5"] = new("building", 1, "Prato", -1);
        return host;
    }

    [Fact]
    public async Task Quote_PricesTheRoadDistanceByBand_OrSaysWhyNot()
    {
        using var host = Host();
        var shop = await SeedAsync();
        using var client = host.Browser();
        Assert.True((await MenuAsync(client, shop)).Restaurant.DeliveryAutoQuote);

        var near = await QuoteAsync(client, shop, "  Via   Vicina 1 ");
        Assert.Equal(
            (DeliveryQuoteResponse.Quoted, "Prato", 2500, 200L),
            (near.Result, near.Town, near.DistanceMeters, near.FeeCents)
        );
        Assert.False(string.IsNullOrEmpty(near.Quote));
        // The band's limit is inclusive.
        Assert.Equal(400, (await QuoteAsync(client, shop, "Via Media 2")).FeeCents);
        // Out of range says where the address was found.
        Assert.Equal(
            new DeliveryQuoteResponse(DeliveryQuoteResponse.OutOfRange, "Campi Bisenzio", 12_000),
            await QuoteAsync(client, shop, "Via Lontana 3")
        );

        // The search sends the restaurant's point, longitude first, a circle beyond the last band and
        // asks for Italian place names.
        var search = QueryHelpers.ParseQuery(host.GeoapifyService.Calls.First().Query);
        Assert.Equal(
            (
                "Via Vicina 1",
                "circle:11.096122,43.880153,15000",
                "proximity:11.096122,43.880153",
                "it",
                Key
            ),
            (
                search["text"].ToString(),
                search["filter"].ToString(),
                search["bias"].ToString(),
                search["lang"].ToString(),
                search["apiKey"].ToString()
            )
        );

        // A precise match only outside the circle is out of range without a route: the search is
        // repeated without the circle, still biased to the restaurant.
        var calls = host.GeoapifyService.Calls.Count;
        Assert.Equal(
            new DeliveryQuoteResponse(DeliveryQuoteResponse.OutOfRange, "Firenze"),
            await QuoteAsync(client, shop, "Piazza Remota 7, Firenze")
        );
        var anywhere = QueryHelpers.ParseQuery(host.GeoapifyService.Calls.Last().Query);
        Assert.Equal(
            (calls + 2, "/v1/geocode/search", false, "proximity:11.096122,43.880153"),
            (
                host.GeoapifyService.Calls.Count,
                host.GeoapifyService.Calls.Last().AbsolutePath,
                anywhere.ContainsKey("filter"),
                anywhere["bias"].ToString()
            )
        );

        // A street without its number, a doubtful match, no match (near or anywhere) and an outage
        // are not priced; each searches once more without the circle, and only a precise match asks
        // for a route.
        calls = host.GeoapifyService.Calls.Count;
        foreach (
            var address in new[]
            {
                "Via Lunga",
                "Via Marni 1",
                "Via Sconosciuta 9",
                "Via Remota, Firenze",
            }
        )
            Assert.Equal(
                new DeliveryQuoteResponse(DeliveryQuoteResponse.Unknown),
                await QuoteAsync(client, shop, address)
            );
        Assert.Equal(calls + 8, host.GeoapifyService.Calls.Count);
        Assert.DoesNotContain(
            host.GeoapifyService.Calls.Skip(calls),
            call => call.AbsolutePath == "/v1/routing"
        );

        // Malformed answers are not priced: a match without coordinates (searched near and anywhere,
        // no route), a negative distance and a route without its distance (both after the route call).
        foreach (
            var (address, callsMade) in new[] { ("Via Senza Punto 4", 2), ("Via Rovescia 5", 2) }
        )
        {
            calls = host.GeoapifyService.Calls.Count;
            Assert.Equal(
                DeliveryQuoteResponse.Unknown,
                (await QuoteAsync(client, shop, address)).Result
            );
            Assert.Equal(calls + callsMade, host.GeoapifyService.Calls.Count);
        }
        host.GeoapifyService.RouteWithoutDistance = true;
        Assert.Equal(
            DeliveryQuoteResponse.Unknown,
            (await QuoteAsync(client, shop, "Via Vicina 1")).Result
        );
        host.GeoapifyService.RouteWithoutDistance = false;

        host.GeoapifyService.Failure = HttpStatusCode.ServiceUnavailable;
        Assert.Equal(
            DeliveryQuoteResponse.Unknown,
            (await QuoteAsync(client, shop, "Via Vicina 1")).Result
        );

        foreach (var address in new[] { " ", new string('a', 201) })
            await AssertErrorAsync(
                await PostQuoteAsync(client, shop.Slug, address),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        await AssertErrorAsync(
            await PostQuoteAsync(client, "no-such-link", "Via Vicina 1"),
            HttpStatusCode.NotFound,
            "ONLINE_LINK_NOT_FOUND"
        );
    }

    [Fact]
    public async Task Quote_WithoutKeySetupOrOpenOrdering_IsUnknownWithoutCallingGeoapify()
    {
        var shop = await SeedAsync();
        using (var off = new AccountTestHost(database))
        {
            off.Clock.Set(MondayNoon);
            using var client = off.Browser();
            Assert.False((await MenuAsync(client, shop)).Restaurant.DeliveryAutoQuote);
            // The owner's settings say whether this server prices delivery at all.
            Assert.False((await OwnerSettingsAsync(off, shop)).DeliveryAutoQuote);
            Assert.Equal(
                DeliveryQuoteResponse.Unknown,
                (await QuoteAsync(client, shop, "Via Vicina 1")).Result
            );
            Assert.Empty(off.GeoapifyService.Calls);
        }

        using var host = Host();
        Assert.True((await OwnerSettingsAsync(host, shop)).DeliveryAutoQuote);
        using var browser = host.Browser();
        async Task AssertUnknown(bool autoQuote)
        {
            Assert.Equal(autoQuote, (await MenuAsync(browser, shop)).Restaurant.DeliveryAutoQuote);
            Assert.Equal(
                DeliveryQuoteResponse.Unknown,
                (await QuoteAsync(browser, shop, "Via Vicina 1")).Result
            );
        }
        // Outside the hours, delivery off, or without bands.
        host.Clock.Set(MondayNoon.AddHours(4));
        await AssertUnknown(autoQuote: true);
        host.Clock.Set(MondayNoon);
        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.DeliveryEnabled, false));
        await AssertUnknown(autoQuote: true);
        await using (var db = database.CreateContext())
            await db
                .DeliveryTiers.Where(t => t.RestaurantId == shop.RestaurantId)
                .ExecuteDeleteAsync();
        await AssertUnknown(autoQuote: false);
        Assert.Empty(host.GeoapifyService.Calls);
    }

    [Fact]
    public async Task Quote_DailyCapsPerRestaurantAndSiteWide_FallBackToUnknown()
    {
        using var host = Host(options =>
        {
            options.DailyQuotesPerRestaurant = 2;
            options.DailyQuotes = 3;
        });
        var first = await SeedAsync();
        var second = await SeedAsync();
        using var client = host.Browser();
        string Result(DeliveryQuoteResponse quote) => quote.Result;

        Assert.Equal(
            DeliveryQuoteResponse.Quoted,
            Result(await QuoteAsync(client, first, "Via Vicina 1"))
        );
        Assert.Equal(
            DeliveryQuoteResponse.Quoted,
            Result(await QuoteAsync(client, first, "Via Vicina 1"))
        );
        var calls = host.GeoapifyService.Calls.Count;
        // The first restaurant has used its share; the second still has the last site-wide quote.
        Assert.Equal(
            DeliveryQuoteResponse.Unknown,
            Result(await QuoteAsync(client, first, "Via Vicina 1"))
        );
        Assert.Equal(calls, host.GeoapifyService.Calls.Count);
        Assert.Equal(
            DeliveryQuoteResponse.Quoted,
            Result(await QuoteAsync(client, second, "Via Vicina 1"))
        );
        Assert.Equal(
            DeliveryQuoteResponse.Unknown,
            Result(await QuoteAsync(client, second, "Via Vicina 1"))
        );
        Assert.Equal(calls + 2, host.GeoapifyService.Calls.Count);
    }

    [Fact]
    public async Task Quote_PerIpBudget_IsSeparateFromSubmissions()
    {
        using var host = Host(lowLimits: true);
        var shop = await SeedAsync();
        using var client = host.Browser();
        for (var i = 0; i < 3; i++)
            Assert.Equal(
                HttpStatusCode.OK,
                (await PostQuoteAsync(client, shop.Slug, "Via Vicina 1")).StatusCode
            );
        var limited = await PostQuoteAsync(client, shop.Slug, "Via Vicina 1");
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        // Asking for fees used none of the submission budget.
        Assert.Equal(
            HttpStatusCode.Created,
            (
                await SubmitAsync(client, shop, Body(Guid.NewGuid(), shop, "Via Vicina 1", null))
            ).StatusCode
        );
    }

    [Fact]
    public async Task Submit_QuotedDelivery_KeepsTheQuotedFeeThroughAcceptance()
    {
        using var host = Host();
        var shop = await SeedAsync();
        using var client = host.Browser();
        var quote = await QuoteAsync(client, shop, "Via Vicina 1");

        // The address may differ in spacing only.
        var created = await SubmitAsync(
            client,
            shop,
            Body(Guid.NewGuid(), shop, " Via  Vicina 1", Quoted(quote))
        );
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var submission = (await created.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        await using (var db = database.CreateContext())
        {
            var stored = await db.OnlineRequests.SingleAsync(r =>
                r.StatusToken == submission.StatusToken
            );
            Assert.Equal(
                (200L, 2500),
                (stored.DeliveryFeeCents!.Value, stored.DeliveryDistanceMeters!.Value)
            );
            Assert.Equal("Via  Vicina 1", stored.DeliveryAddress);
        }

        // The customer sees the fee and the total before acceptance; staff see it with the distance.
        var status = (
            await client.GetFromJsonAsync<OnlineOrderStatusResponse>(
                $"/api/public/online-orders/{submission.StatusToken}"
            )
        )!;
        Assert.Equal((200L, 2600L), (status.DeliveryFeeCents!.Value, status.TotalAmountCents));
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        var pending = Assert.Single(
            (await staff.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending"))!.Items
        );
        Assert.Equal(
            (200L, 2500),
            (pending.DeliveryFeeCents!.Value, pending.DeliveryDistanceMeters!.Value)
        );

        // Whoever accepts keeps the quoted fee and cannot change it.
        var path = $"/api/staff/online/requests/{pending.Id}/accept";
        await AssertErrorAsync(
            await PostAsync(staff, path, new { estimatedMinutes = 30, deliveryFeeCents = 400 }),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        var accepted = await PostAsync(staff, path, new { estimatedMinutes = 30 });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var order = (await accepted.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>())!;
        Assert.Equal((200L, 2600L), (order.DeliveryFeeCents!.Value, order.TotalAmountCents));
    }

    [Fact]
    public async Task Submit_FreeDelivery_UsesTheDiscountedTotalAndLocksTheFinalFee()
    {
        using var host = Host();
        var shop = await SeedAsync();
        host.GeoapifyService.Places["Via Media 2"] = new("building", 1, "Prato", 5000);
        await using (var db = database.CreateContext())
        {
            await db
                .DeliveryTiers.Where(t =>
                    t.RestaurantId == shop.RestaurantId && t.MaxMeters <= 6000
                )
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(
                        t => t.FreeDeliveryMinCents,
                        t => t.MaxMeters == 3000 ? 2400L : 3000L
                    )
                );
            db.OnlineCoupons.Add(
                new()
                {
                    Id = Guid.NewGuid(),
                    RestaurantId = shop.RestaurantId,
                    Code = "EAT10",
                    PercentOff = 10,
                }
            );
            await db.SaveChangesAsync();
        }
        using var customer = host.Browser();
        var menu = await MenuAsync(customer, shop);
        Assert.Equal(new DeliveryTierResponse(3000, 200, 2400), menu.Restaurant.DeliveryTiers[0]);
        var near = await QuoteAsync(customer, shop, "Via Vicina 1");
        Assert.Equal(200, near.FeeCents);
        var waived = new { quote = near.Quote, feeCents = 0 };
        var coupon = new { code = "EAT10", percentOff = 10 };
        await AssertErrorAsync(
            await SubmitAsync(
                customer,
                shop,
                Body(Guid.NewGuid(), shop, "Via Vicina 1", waived, coupon)
            ),
            HttpStatusCode.Conflict,
            "DELIVERY_FEE_CHANGED"
        );
        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.DeliveryMinOrderCents, 2300L));
        await AssertErrorAsync(
            await SubmitAsync(
                customer,
                shop,
                Body(Guid.NewGuid(), shop, "Via Vicina 1", Quoted(near), coupon)
            ),
            HttpStatusCode.Conflict,
            "DELIVERY_MIN_ORDER"
        );
        var order = Body(Guid.NewGuid(), shop, "Via Vicina 1", waived);
        var created = await SubmitAsync(customer, shop, order);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var stored = (await created.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;

        using var fartherCustomer = host.Browser();
        var far = await QuoteAsync(fartherCustomer, shop, "Via Media 2");
        Assert.Equal((5000, 400L), (far.DistanceMeters, far.FeeCents));
        await AssertErrorAsync(
            await SubmitAsync(
                fartherCustomer,
                shop,
                Body(Guid.NewGuid(), shop, "Via Media 2", new { quote = far.Quote, feeCents = 0 })
            ),
            HttpStatusCode.Conflict,
            "DELIVERY_FEE_CHANGED"
        );
        Assert.Equal(
            HttpStatusCode.Created,
            (
                await SubmitAsync(
                    fartherCustomer,
                    shop,
                    Body(Guid.NewGuid(), shop, "Via Media 2", Quoted(far))
                )
            ).StatusCode
        );

        // The owner removes the waiver after submission. Recovery and acceptance use the stored fee.
        await SetTiersAsync(shop, (3000, 200), (6000, 400));
        var repeated = await SubmitAsync(customer, shop, order);
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(stored, await repeated.Content.ReadFromJsonAsync<OnlineSubmissionResponse>());
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        var pending = (
            await staff.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending")
        )!.Items.Single(item => item.Number == stored.Number);
        Assert.Equal(0, pending.DeliveryFeeCents);
        var accepted = await PostAsync(
            staff,
            $"/api/staff/online/requests/{pending.Id}/accept",
            new { estimatedMinutes = 30 }
        );
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var active = (await accepted.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>())!;
        Assert.Equal((0L, 2400L), (active.DeliveryFeeCents, active.TotalAmountCents));
    }

    [Fact]
    public async Task Submit_QuotedFeeAtTheLimit_ChecksBeforeDiscountAndOnlyNotifiesOnCommit()
    {
        using var host = Host(push: true);
        var shop = await SeedAsync();
        using var customer = host.Browser();
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var device = new TestDevice();
        var registered = await PushSubscriptionTests.SendAsync(
            staff,
            HttpMethod.Put,
            "/api/staff/push/subscription",
            device.Body()
        );
        Assert.Equal(HttpStatusCode.NoContent, registered.StatusCode);
        const long feeAtLimit = InputRules.MaxSafeCents - 2400;
        await SetTiersAsync(shop, (3000, feeAtLimit + 1));
        await using var db = database.CreateContext();
        db.OnlineCoupons.Add(
            new()
            {
                Id = Guid.NewGuid(),
                RestaurantId = shop.RestaurantId,
                Code = "EAT10",
                PercentOff = 10,
            }
        );
        await db.SaveChangesAsync();
        var quote = await QuoteAsync(customer, shop, "Via Vicina 1");
        var coupon = new { code = "EAT10", percentOff = 10 };
        var id = Guid.NewGuid();
        await AssertErrorAsync(
            await SubmitAsync(
                customer,
                shop,
                Body(id, shop, "Via Vicina 1", Quoted(quote), coupon)
            ),
            HttpStatusCode.Conflict,
            "DELIVERY_TOTAL_TOO_LARGE"
        );
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == shop.RestaurantId));

        await SetTiersAsync(shop, (3000, feeAtLimit));
        var valid = Body(
            id,
            shop,
            "Via Vicina 1",
            new { quote = quote.Quote, feeCents = feeAtLimit },
            coupon
        );
        var created = await SubmitAsync(customer, shop, valid);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var saved = (await created.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        Assert.Equal(1, saved.Number);
        var request = await db.OnlineRequests.SingleAsync(r => r.ClientRequestId == id);
        var path = $"/api/staff/online/requests/{request.Id}/accept";
        var accepted = await PostAsync(staff, path, new { estimatedMinutes = 30 });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(
            InputRules.MaxSafeCents - 240,
            (
                await accepted.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>()
            )!.TotalAmountCents
        );

        await SetTiersAsync(shop, (3000, feeAtLimit + 1));
        var replay = await SubmitAsync(customer, shop, valid);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(saved, await replay.Content.ReadFromJsonAsync<OnlineSubmissionResponse>());
        // A second successful submission marks the end of the sequential push queue.
        var second = await SubmitAsync(customer, shop, Body(Guid.NewGuid(), shop, null, null));
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var sent = await host.PushService.WaitForAsync(2);
        Assert.Equal(
            new[] { 1, 2 },
            sent.Select(p => device.Read(p).GetProperty("number").GetInt32())
        );
    }

    [Fact]
    public async Task Accept_OlderOversizedQuote_LeavesRequestAvailableForRejection()
    {
        using var host = Host();
        var shop = await SeedAsync();
        await using var db = database.CreateContext();
        var request = OnlineTestData.Request(
            shop.RestaurantId,
            MondayNoon.UtcDateTime,
            1,
            shop.Dish.Id
        );
        request.Fulfillment = OnlineFulfillment.Delivery;
        request.DeliveryAddress = "Via Vicina 1";
        request.DeliveryDistanceMeters = 2500;
        request.DeliveryFeeCents = InputRules.MaxSafeCents;
        db.OnlineRequests.Add(request);
        await db.SaveChangesAsync();
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        var path = $"/api/staff/online/requests/{request.Id}";
        await AssertErrorAsync(
            await PostAsync(staff, path + "/accept", new { estimatedMinutes = 30 }),
            HttpStatusCode.Conflict,
            "DELIVERY_TOTAL_TOO_LARGE"
        );
        await db.Entry(request).ReloadAsync();
        Assert.Null(request.SessionId);
        Assert.Null(request.AcceptedAt);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await PostAsync(staff, path + "/reject", new { })).StatusCode
        );
    }

    [Fact]
    public async Task Submit_UnusableQuote_RejectsAfterTheDuplicateCheckWithoutUsingANumber()
    {
        using var host = Host();
        var shop = await SeedAsync();
        var other = await SeedAsync();
        using var client = host.Browser();
        var quote = await QuoteAsync(client, shop, "Via Vicina 1");
        var foreign = await QuoteAsync(client, other, "Via Vicina 1");

        // Accepted first, so the repeat below can be checked against later changes.
        var original = Body(Guid.NewGuid(), shop, "Via Vicina 1", Quoted(quote));
        var first = await SubmitAsync(client, shop, original);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var stored = (await first.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;

        async Task AssertInvalid(
            string address,
            object deliveryQuote,
            string code = "DELIVERY_QUOTE_INVALID"
        )
        {
            using var customer = host.Browser();
            await AssertErrorAsync(
                await SubmitAsync(
                    customer,
                    shop,
                    Body(Guid.NewGuid(), shop, address, deliveryQuote)
                ),
                HttpStatusCode.Conflict,
                code
            );
        }
        await AssertInvalid("Via Vicina 1", new { quote = quote.Quote + "x", feeCents = 200L });
        await AssertInvalid("Via Vicina 1", Quoted(foreign));
        await AssertInvalid("Via Vicina 10", Quoted(quote));
        await AssertInvalid(
            "Via Vicina 1",
            new { quote = quote.Quote, feeCents = 400L },
            "DELIVERY_FEE_CHANGED"
        );
        // The bands changed since the quote: another fee, or beyond the farthest band.
        await SetTiersAsync(shop, (3000, 250), (6000, 400));
        await AssertInvalid("Via Vicina 1", Quoted(quote), "DELIVERY_FEE_CHANGED");
        await SetTiersAsync(shop, (2000, 200));
        await AssertInvalid("Via Vicina 1", Quoted(quote));
        await SetTiersAsync(shop, (3000, 200), (6000, 400), (10_000, 600));
        // The restaurant's starting point moved since the quote, even if the band would match.
        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.DeliveryOriginLat, 43.880154m));
        await AssertInvalid("Via Vicina 1", Quoted(quote));
        await UpdateRestaurantAsync(shop, u => u.SetProperty(r => r.DeliveryOriginLat, 43.880153m));
        // Quotes last thirty minutes.
        host.Clock.Set(MondayNoon.Add(DeliveryQuotes.Lifetime));
        await AssertInvalid("Via Vicina 1", Quoted(quote));

        // Pickup takes no quote.
        using (var customer = host.Browser())
            await AssertErrorAsync(
                await SubmitAsync(
                    customer,
                    shop,
                    Body(
                        Guid.NewGuid(),
                        shop,
                        null,
                        Quoted(await QuoteAsync(client, shop, "Via Vicina 1"))
                    )
                ),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        // A repeat still finds the stored order, and the rejections used no number.
        var repeat = await SubmitAsync(client, shop, original);
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(stored, await repeat.Content.ReadFromJsonAsync<OnlineSubmissionResponse>());
        using var next = host.Browser();
        var created = await SubmitAsync(
            next,
            shop,
            Body(Guid.NewGuid(), shop, "Via Vicina 1", null)
        );
        Assert.Equal(
            2,
            (await created.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!.Number
        );
    }

    private static object Quoted(DeliveryQuoteResponse quote) =>
        new { quote = quote.Quote, feeCents = quote.FeeCents };

    // Two 12 € ramen; delivery to address, or pickup when address is null.
    private static object Body(
        Guid id,
        OnlineShop shop,
        string? address,
        object? deliveryQuote,
        object? coupon = null
    ) =>
        new
        {
            clientRequestId = id,
            fulfillment = address is null ? "PICKUP" : "DELIVERY",
            customerName = "Marco",
            customerPhone = "+39 333 123 4567",
            deliveryAddress = address,
            deliveryNotes = (string?)null,
            items = new[] { new OrderLineInput(shop.Dish.Id, 2, 1200, null, []) },
            coupon,
            deliveryQuote,
        };

    private sealed record Csrf(string Token);

    private static async Task<string> PublicCsrfAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;

    private static async Task<HttpResponseMessage> PostQuoteAsync(
        HttpClient client,
        string slug,
        string address
    ) =>
        await PostAsync(
            client,
            $"/api/public/r/{slug}/delivery-quote",
            new { address },
            await PublicCsrfAsync(client)
        );

    private static async Task<DeliveryQuoteResponse> QuoteAsync(
        HttpClient client,
        OnlineShop shop,
        string address
    )
    {
        var response = await PostQuoteAsync(client, shop.Slug, address);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DeliveryQuoteResponse>())!;
    }

    private static async Task<HttpResponseMessage> SubmitAsync(
        HttpClient client,
        OnlineShop shop,
        object body
    ) =>
        await PostAsync(
            client,
            $"/api/public/r/{shop.Slug}/requests",
            body,
            await PublicCsrfAsync(client)
        );

    private static async Task<OnlineSettingsResponse> OwnerSettingsAsync(
        AccountTestHost host,
        OnlineShop shop
    )
    {
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        return (
            await owner.GetFromJsonAsync<OnlineSettingsResponse>("/api/staff/online/settings")
        )!;
    }

    private static async Task<OnlineMenuResponse> MenuAsync(HttpClient client, OnlineShop shop) =>
        (
            await client.GetFromJsonAsync<OnlineMenuResponse>(
                $"/api/public/r/{shop.Slug}/bootstrap"
            )
        )!;

    // The seeded shop with delivery from its starting point: 2 € within 3 km, 4 € within 6, 6 € within 10.
    private async Task<OnlineShop> SeedAsync()
    {
        var shop = await OnlineTestData.SeedShopAsync(database);
        await SetTiersAsync(shop, (3000, 200), (6000, 400), (10_000, 600));
        await UpdateRestaurantAsync(
            shop,
            u =>
                u.SetProperty(r => r.DeliveryOriginLat, 43.880153m)
                    .SetProperty(r => r.DeliveryOriginLng, 11.096122m)
                    .SetProperty(r => r.DeliveryEnabled, true)
        );
        return shop;
    }

    private async Task SetTiersAsync(OnlineShop shop, params (int Meters, long Fee)[] tiers)
    {
        await using var db = database.CreateContext();
        await db.DeliveryTiers.Where(t => t.RestaurantId == shop.RestaurantId).ExecuteDeleteAsync();
        db.DeliveryTiers.AddRange(
            tiers.Select(t => new DeliveryTier
            {
                RestaurantId = shop.RestaurantId,
                MaxMeters = t.Meters,
                FeeCents = t.Fee,
            })
        );
        await db.SaveChangesAsync();
    }

    private async Task UpdateRestaurantAsync(
        OnlineShop shop,
        Action<Microsoft.EntityFrameworkCore.Query.UpdateSettersBuilder<Restaurant>> update
    )
    {
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == shop.RestaurantId).ExecuteUpdateAsync(update);
    }
}
