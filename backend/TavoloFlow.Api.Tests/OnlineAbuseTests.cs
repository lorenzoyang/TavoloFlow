using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.OnlineTestData;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineAbuseTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    private static OnlineRequestInput Body(OnlineShop shop, Guid? id = null) =>
        new(
            id ?? Guid.NewGuid(),
            "PICKUP",
            "Marco",
            "+393331234567",
            null,
            null,
            [new OrderLineInput(shop.Dish.Id, 1, 1200, null, [])],
            null,
            null
        );

    private static string Root(OnlineShop shop) => $"/api/public/r/{shop.Slug}";

    private static async Task<string> Csrf(HttpClient client) =>
        (await client.GetFromJsonAsync<CsrfResponse>("/api/public/csrf"))!.Token;

    private sealed record CsrfResponse(string Token);

    private static async Task<HttpResponseMessage> Submit(
        HttpClient client,
        OnlineShop shop,
        OnlineRequestInput? body = null
    ) => await PostAsync(client, Root(shop) + "/requests", body ?? Body(shop), await Csrf(client));

    private static async Task<OnlineOrderingContextResponse> Context(
        HttpClient client,
        OnlineShop shop
    ) =>
        (
            await client.GetFromJsonAsync<OnlineOrderingContextResponse>(
                Root(shop) + "/ordering-context"
            )
        )!;

    [Fact]
    public async Task Browser_RejectsAnotherRequest_PreservesOriginalAndRestaurantIsolation()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        using var client = host.Browser();
        var body = Body(shop);
        var first = (
            await (
                await Submit(client, shop, body)
            ).Content.ReadFromJsonAsync<OnlineSubmissionResponse>()
        )!;
        var conflict = await Submit(client, shop);
        var conflictBody = await conflict.Content.ReadAsStringAsync();
        await AssertErrorAsync(conflict, HttpStatusCode.Conflict, "ONLINE_BROWSER_PENDING");
        var raw = System
            .Text.Json.JsonDocument.Parse(conflictBody)
            .RootElement.GetProperty("existingSubmission");
        Assert.Equal(first.StatusToken, raw.GetProperty("statusToken").GetString());
        Assert.Equal(first, (await Context(client, shop)).Pending);
        using var stranger = host.Browser();
        Assert.Null((await Context(stranger, shop)).Pending);
        Assert.Null((await Context(client, other)).Pending);
        Assert.Equal(HttpStatusCode.Created, (await Submit(client, other)).StatusCode);
        Assert.Equal(
            first,
            await (
                await Submit(client, shop, body)
            ).Content.ReadFromJsonAsync<OnlineSubmissionResponse>()
        );
        await using var db = database.CreateContext();
        var saved = await db.OnlineRequests.SingleAsync(r => r.RestaurantId == shop.RestaurantId);
        Assert.Equal(64, saved.BrowserKey!.Length);
        Assert.Equal(64, saved.IpKey!.Length);
        Assert.Equal(
            1,
            (
                await db.OnlineCounters.SingleAsync(c => c.RestaurantId == shop.RestaurantId)
            ).LastNumber
        );
    }

    [Theory]
    [InlineData("ACCEPTED")]
    [InlineData("REJECTED")]
    [InlineData("EXPIRED")]
    public async Task Browser_DecisionOrExpiry_ReleasesSlotAndDecisionsClearDigests(string outcome)
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        using var client = host.Browser();
        Assert.Equal(HttpStatusCode.Created, (await Submit(client, shop)).StatusCode);
        Guid firstId;
        await using (var db = database.CreateContext())
        {
            var request = await db.OnlineRequests.SingleAsync(r =>
                r.RestaurantId == shop.RestaurantId
            );
            firstId = request.Id;
            var staff = new OnlineStaffService(db, host.Clock);
            if (outcome == "ACCEPTED")
                await staff.AcceptAsync(shop.RestaurantId, request.Id, new(20, null), default);
            else if (outcome == "REJECTED")
                await staff.RejectAsync(shop.RestaurantId, request.Id, new(null), default);
            else
                host.Clock.Advance(OnlineRequestService.WaitingTime);
        }
        Assert.Null((await Context(client, shop)).Pending);
        var next = await Submit(client, shop);
        Assert.Equal(HttpStatusCode.Created, next.StatusCode);
        Assert.Equal(2, (await next.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!.Number);

        // A decision clears the first request's source digests; an expired one keeps them until
        // the 30-day contact cleanup.
        await using var check = database.CreateContext();
        var first = await check.OnlineRequests.SingleAsync(r => r.Id == firstId);
        if (outcome == "EXPIRED")
        {
            Assert.NotNull(first.BrowserKey);
            Assert.NotNull(first.IpKey);
        }
        else
        {
            Assert.Null(first.BrowserKey);
            Assert.Null(first.IpKey);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Submit_ConcurrentDistinctRequests_EnforcesSourceCapWithoutNumberGaps(
        bool sameBrowser
    )
    {
        var shop = await SeedShopAsync(database);
        var clock = new TestClock();
        clock.Set(Noon);
        var outcomes = await Task.WhenAll(
            Enumerable
                .Range(0, 8)
                .Select(async i =>
                {
                    await using var db = database.CreateContext();
                    var source = new OnlineSubmissionSource(
                        sameBrowser ? "browser" : $"browser-{i}",
                        sameBrowser ? $"192.0.2.{i + 1}" : "192.0.2.1"
                    );
                    try
                    {
                        var result = await new OnlineRequestService(
                            db,
                            clock,
                            NoPush,
                            SubmissionLimits,
                            NoVerification,
                            Quotes
                        ).SubmitAsync(shop.Slug, Body(shop), source, default);
                        Assert.True(result.Created);
                        return "CREATED";
                    }
                    catch (ApiException error)
                    {
                        return error.Code;
                    }
                })
        );
        var maximum = sameBrowser ? 1 : 5;
        Assert.Equal(maximum, outcomes.Count(o => o == "CREATED"));
        Assert.Equal(
            8 - maximum,
            outcomes.Count(o =>
                o == (sameBrowser ? "ONLINE_BROWSER_PENDING" : "ONLINE_IP_WAITING_LIMIT")
            )
        );
        await using var check = database.CreateContext();
        Assert.Equal(
            maximum,
            await check.OnlineRequests.CountAsync(r => r.RestaurantId == shop.RestaurantId)
        );
        Assert.Equal(
            maximum,
            (
                await check.OnlineCounters.SingleAsync(r => r.RestaurantId == shop.RestaurantId)
            ).LastNumber
        );
    }

    [Fact]
    public async Task Ip_FiveBrowsersFillSlots_OtherIpAndOriginalRecoveryStillWork()
    {
        using var host = new AccountTestHost(database, onlineLimits: o => o.MaxWaitingPerIp = 5);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        for (var i = 0; i < 5; i++)
        {
            using var browser = host.Browser("192.0.2.1");
            Assert.Equal(HttpStatusCode.Created, (await Submit(browser, shop)).StatusCode);
        }
        using var blocked = host.Browser("192.0.2.1");
        var refusal = await Submit(blocked, shop);
        await AssertErrorAsync(refusal, HttpStatusCode.Conflict, "ONLINE_IP_WAITING_LIMIT");
        Assert.DoesNotContain("statusToken", await refusal.Content.ReadAsStringAsync());
        using var other = host.Browser("192.0.2.2");
        Assert.Equal(HttpStatusCode.Created, (await Submit(other, shop)).StatusCode);
        await using (var db = database.CreateContext())
        {
            var first = await db
                .OnlineRequests.Where(r => r.RestaurantId == shop.RestaurantId)
                .OrderBy(r => r.Number)
                .FirstAsync();
            await new OnlineStaffService(db, host.Clock).RejectAsync(
                shop.RestaurantId,
                first.Id,
                new(null),
                default
            );
        }
        Assert.Equal(HttpStatusCode.Created, (await Submit(blocked, shop)).StatusCode);
    }

    [Fact]
    public async Task Limits_InvalidJsonCsrfAndRepeatsCount_ReadBudgetsRemainAvailable()
    {
        using var host = new AccountTestHost(
            database,
            onlineLimits: o => o.SubmissionsPerIpPerMinute = 3
        );
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        using var client = host.Browser("192.0.2.10");
        var csrf = await Csrf(client);
        using var malformed = new HttpRequestMessage(HttpMethod.Post, Root(shop) + "/requests")
        {
            Content = new StringContent("{", Encoding.UTF8, "application/json"),
        };
        malformed.Headers.Add("X-CSRF-TOKEN", csrf);
        await AssertErrorAsync(
            await client.SendAsync(malformed),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        await AssertErrorAsync(
            await client.PostAsJsonAsync(Root(shop) + "/requests", Body(shop)),
            HttpStatusCode.BadRequest,
            "CSRF_VALIDATION_FAILED"
        );
        var body = Body(shop);
        var accepted = await PostAsync(client, Root(shop) + "/requests", body, csrf);
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        var result = (await accepted.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        var limited = await PostAsync(client, Root(shop) + "/requests", body, csrf);
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.True(limited.Headers.RetryAfter!.Delta > TimeSpan.Zero);
        Assert.Equal("no-store", limited.Headers.CacheControl!.ToString());
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(Root(shop) + "/bootstrap")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await client.GetAsync(Root(shop) + $"/requests/by-client-id/{body.ClientRequestId}")
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync($"/api/public/online-orders/{result.StatusToken}")).StatusCode
        );
        Assert.Equal(result, (await Context(client, shop)).Pending);
        using var another = host.Browser("192.0.2.11");
        Assert.Equal(HttpStatusCode.Created, (await Submit(another, shop)).StatusCode);
    }

    [Fact]
    public async Task Limits_TenMinuteWindowAndAllReadFamilies_AreIndependent()
    {
        using var host = new AccountTestHost(
            database,
            onlineLimits: o =>
            {
                o.SubmissionsPerIpPerTenMinutes = 2;
                o.MenusPerIpPerMinute =
                    o.StatusChecksPerIpPerMinute =
                    o.RecoveriesPerIpPerMinute =
                    o.ContextChecksPerIpPerMinute =
                    o.CouponChecksPerIpPerTenMinutes =
                        1;
            }
        );
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        using var client = host.Browser("192.0.2.20");
        for (var i = 0; i < 2; i++)
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await client.PostAsJsonAsync(Root(shop) + "/requests", Body(shop))).StatusCode
            );
        var limited = await client.PostAsJsonAsync(Root(shop) + "/requests", Body(shop));
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.True(limited.Headers.RetryAfter!.Delta > TimeSpan.FromMinutes(9));
        foreach (
            var path in new[]
            {
                Root(shop) + "/bootstrap",
                Root(shop) + "/ordering-context",
                Root(shop) + $"/requests/by-client-id/{Guid.NewGuid()}",
                "/api/public/online-orders/unknown",
                Root(shop) + "/coupons/UNKNOWN",
            }
        )
        {
            Assert.NotEqual(
                HttpStatusCode.TooManyRequests,
                (await client.GetAsync(path)).StatusCode
            );
            await AssertErrorAsync(
                await client.GetAsync(path),
                HttpStatusCode.TooManyRequests,
                "RATE_LIMITED"
            );
        }
        using var mapped = host.Browser("::ffff:192.0.2.20");
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await mapped.GetAsync(Root(shop) + "/bootstrap")).StatusCode
        );
        using var other = host.Browser("192.0.2.21");
        Assert.Equal(
            HttpStatusCode.OK,
            (await other.GetAsync(Root(shop) + "/bootstrap")).StatusCode
        );
    }

    [Fact]
    public async Task Cookie_ContextIssuesFixedSecureMarker_InvalidOrMissingMarkerCannotSubmit()
    {
        using var host = new AccountTestHost(database, production: true);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        using var browser = host.Browser();
        var issued = await browser.GetAsync(Root(shop) + "/ordering-context");
        var cookie = SetCookieHeaderValue.Parse(issued.Headers.GetValues("Set-Cookie").Single());
        Assert.Equal(OnlineBrowser.CookieName, cookie.Name.ToString());
        Assert.True(cookie.HttpOnly);
        Assert.True(cookie.Secure);
        Assert.Equal(Microsoft.Net.Http.Headers.SameSiteMode.Strict, cookie.SameSite);
        Assert.Equal("/api/public", cookie.Path.ToString());
        Assert.Equal(Noon + OnlineBrowser.Lifetime, cookie.Expires);
        Assert.False(
            (await browser.GetAsync(Root(shop) + "/ordering-context")).Headers.Contains(
                "Set-Cookie"
            )
        );
        using var manual = host.CreateClient(
            new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false }
        );
        var csrfResponse = await manual.GetAsync("/api/public/csrf");
        var csrf = (await csrfResponse.Content.ReadFromJsonAsync<CsrfResponse>())!.Token;
        var csrfCookie = SetCookieHeaderValue
            .ParseList(csrfResponse.Headers.GetValues("Set-Cookie").ToList())
            .Single(c => c.Name.ToString() == "TavoloFlow.Csrf");
        foreach (
            var marker in new[]
            {
                "",
                $"; {OnlineBrowser.CookieName}=tampered",
                $"; {OnlineBrowser.CookieName}={cookie.Value}",
            }
        )
        {
            if (marker.Contains(cookie.Value.ToString(), StringComparison.Ordinal))
                host.Clock.Advance(OnlineBrowser.Lifetime);
            using var request = new HttpRequestMessage(HttpMethod.Post, Root(shop) + "/requests")
            {
                Content = JsonContent.Create(Body(shop)),
            };
            request.Headers.Add("Cookie", $"{csrfCookie.Name}={csrfCookie.Value}" + marker);
            request.Headers.Add("X-CSRF-TOKEN", csrf);
            await AssertErrorAsync(
                await manual.SendAsync(request),
                HttpStatusCode.BadRequest,
                "ONLINE_BROWSER_REQUIRED"
            );
        }
        var replacement = await browser.GetAsync(Root(shop) + "/ordering-context");
        Assert.True(replacement.Headers.Contains("Set-Cookie"));
        await using var db = database.CreateContext();
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
    }
}
