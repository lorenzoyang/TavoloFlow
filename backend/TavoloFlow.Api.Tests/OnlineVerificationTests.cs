using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.OnlineTestData;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineVerificationTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);
    private const string SiteKey = "0x-fixture-site-key";
    private const string SecretKey = "0x-fixture-secret-key";

    private static void Enabled(TurnstileOptions o)
    {
        o.Enabled = true;
        o.SiteKey = SiteKey;
        o.SecretKey = SecretKey;
        o.Hostname = "localhost";
    }

    private AccountTestHost Host(bool production = false) =>
        new(database, production: production, verificationOptions: Enabled);

    private static OnlineRequestInput Body(OnlineShop shop, Guid id, string? token = "proof") =>
        new(
            id,
            "PICKUP",
            "Marco",
            "3331234567",
            null,
            null,
            [new OrderLineInput(shop.Dish.Id, 1, 1200, null, [])],
            null,
            token
        );

    private static HttpResponseMessage Valid(
        OnlineShop shop,
        Guid id,
        string hostname = "localhost",
        string action = OnlineVerification.Action
    ) =>
        new(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(
                new
                {
                    success = true,
                    hostname,
                    action,
                    cdata = OnlineVerification.Binding(shop.RestaurantId, id),
                }
            ),
        };

    private static async Task<HttpResponseMessage> Submit(
        HttpClient client,
        OnlineShop shop,
        OnlineRequestInput body
    )
    {
        var csrf = (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;
        return await PostAsync(client, $"/api/public/r/{shop.Slug}/requests", body, csrf);
    }

    private sealed record Csrf(string Token);

    [Fact]
    public async Task Submit_ValidBinding_SavesOnceAndRecoversWithoutProvider()
    {
        using var host = Host(production: true);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var id = Guid.NewGuid();
        host.VerificationService.Respond = (_, _) => Task.FromResult(Valid(shop, id));
        using var client = host.Browser();
        var raw = await client.GetStringAsync($"/api/public/r/{shop.Slug}/bootstrap");
        Assert.Contains(SiteKey, raw);
        Assert.DoesNotContain(SecretKey, raw);
        var first = await Submit(client, shop, Body(shop, id));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var stored = await first.Content.ReadFromJsonAsync<OnlineSubmissionResponse>();
        host.VerificationService.Respond = (_, _) =>
            throw new InvalidOperationException("Provider must not be called for a saved request.");
        var repeated = await Submit(client, shop, Body(shop, id, null));
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(stored, await repeated.Content.ReadFromJsonAsync<OnlineSubmissionResponse>());
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await client.GetAsync($"/api/public/r/{shop.Slug}/requests/by-client-id/{id}")
            ).StatusCode
        );
        Assert.Single(host.VerificationService.Calls);
        Assert.Equal(SecretKey, host.VerificationService.Calls.Single().Secret);
        await using var db = database.CreateContext();
        Assert.Single(
            await db.OnlineRequests.Where(r => r.RestaurantId == shop.RestaurantId).ToArrayAsync()
        );
        Assert.Equal(
            1,
            (
                await db.OnlineCounters.SingleAsync(r => r.RestaurantId == shop.RestaurantId)
            ).LastNumber
        );
    }

    [Theory]
    [InlineData("hostname")]
    [InlineData("action")]
    [InlineData("request")]
    [InlineData("restaurant")]
    [InlineData("expired")]
    [InlineData("missing")]
    [InlineData("oversized")]
    public async Task Submit_InvalidProof_CreatesNoWorkOrNumber(string kind)
    {
        using var host = Host();
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var id = Guid.NewGuid();
        host.VerificationService.Respond = (_, _) =>
            Task.FromResult(
                kind switch
                {
                    "hostname" => Valid(shop, id, "other.example.com"),
                    "action" => Valid(shop, id, action: "login"),
                    "request" => Valid(shop, Guid.NewGuid()),
                    "restaurant" => Valid(shop with { RestaurantId = Guid.NewGuid() }, id),
                    _ => Valid(shop, id),
                }
            );
        if (kind == "expired")
            host.VerificationService.Respond = (_, _) =>
                Task.FromResult(
                    new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(
                            "{\"success\":false,\"error-codes\":[\"timeout-or-duplicate\"]}",
                            Encoding.UTF8,
                            "application/json"
                        ),
                    }
                );
        using var client = host.Browser();
        var token =
            kind == "missing" ? null
            : kind == "oversized" ? new string('a', 2049)
            : "proof";
        await AssertErrorAsync(
            await Submit(client, shop, Body(shop, id, token)),
            HttpStatusCode.BadRequest,
            "ONLINE_VERIFICATION_FAILED"
        );
        await using var db = database.CreateContext();
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
        Assert.False(await db.OnlineCounters.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
        Assert.False(await db.Orders.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
        if (kind is "missing" or "oversized")
            Assert.Empty(host.VerificationService.Calls);
    }

    [Theory]
    [InlineData("http")]
    [InlineData("json")]
    [InlineData("schema")]
    [InlineData("secret")]
    [InlineData("timeout")]
    public async Task Submit_ProviderFailure_ReturnsUnavailableWithoutSaving(string kind)
    {
        using var host = Host();
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        host.VerificationService.Respond = async (_, ct) =>
        {
            if (kind == "timeout")
                await Task.Delay(Timeout.Infinite, ct);
            return new(kind == "http" ? HttpStatusCode.TooManyRequests : HttpStatusCode.OK)
            {
                Content = new StringContent(
                    kind switch
                    {
                        "json" => "invalid-json",
                        "secret" =>
                            "{\"success\":false,\"error-codes\":[\"invalid-input-secret\"]}",
                        _ => "{}",
                    },
                    Encoding.UTF8,
                    "application/json"
                ),
            };
        };
        using var client = host.Browser();
        await AssertErrorAsync(
            await Submit(client, shop, Body(shop, Guid.NewGuid())),
            HttpStatusCode.ServiceUnavailable,
            "ONLINE_VERIFICATION_UNAVAILABLE"
        );
        await using var db = database.CreateContext();
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == shop.RestaurantId));
    }

    [Fact]
    public async Task Submit_ConcurrentSameId_SavesOnceAndDoesNotLockWhileVerifying()
    {
        using var host = Host();
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var id = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        host.VerificationService.Respond = async (token, ct) =>
        {
            if (token == "slow")
            {
                entered.TrySetResult();
                await release.Task.WaitAsync(ct);
            }
            return Valid(shop, token == "other" ? otherId : id);
        };
        using var a = host.Browser();
        using var b = host.Browser();
        using var other = host.Browser();
        var pending = Submit(a, shop, Body(shop, id, "slow"));
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            // Same restaurant proceeds while the first request waits on Cloudflare.
            Assert.Equal(
                HttpStatusCode.Created,
                (await Submit(other, shop, Body(shop, otherId, "other"))).StatusCode
            );
            Assert.Equal(
                HttpStatusCode.Created,
                (await Submit(b, shop, Body(shop, id))).StatusCode
            );
        }
        finally
        {
            release.TrySetResult();
        }
        Assert.Equal(HttpStatusCode.OK, (await pending).StatusCode);
        await using var db = database.CreateContext();
        Assert.Equal(
            2,
            await db.OnlineRequests.CountAsync(r => r.RestaurantId == shop.RestaurantId)
        );
        Assert.Equal(
            2,
            (
                await db.OnlineCounters.SingleAsync(r => r.RestaurantId == shop.RestaurantId)
            ).LastNumber
        );
    }

    [Fact]
    public async Task Submit_ReusedSuccessfulProof_CannotCreateAnotherRequestOrRestaurant()
    {
        using var host = Host();
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        var id = Guid.NewGuid();
        host.VerificationService.Respond = (_, _) => Task.FromResult(Valid(shop, id));
        using var first = host.Browser();
        using var next = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await Submit(first, shop, Body(shop, id))).StatusCode
        );
        await AssertErrorAsync(
            await Submit(next, shop, Body(shop, Guid.NewGuid())),
            HttpStatusCode.BadRequest,
            "ONLINE_VERIFICATION_FAILED"
        );
        await AssertErrorAsync(
            await Submit(next, other, Body(other, id)),
            HttpStatusCode.BadRequest,
            "ONLINE_VERIFICATION_FAILED"
        );
        await using var db = database.CreateContext();
        Assert.Single(
            await db.OnlineRequests.Where(r => r.RestaurantId == shop.RestaurantId).ToArrayAsync()
        );
        Assert.False(await db.OnlineRequests.AnyAsync(r => r.RestaurantId == other.RestaurantId));
    }

    [Fact]
    public async Task Submit_VerificationFailureAndReplay_NotifyOnlyCommittedFirstRequest()
    {
        using var host = new AccountTestHost(database, push: true, verificationOptions: Enabled);
        host.Clock.Set(Noon);
        var shop = await SeedShopAsync(database);
        var id = Guid.NewGuid();
        using var device = new TestDevice();
        using var staff = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PushSubscriptionTests.SendAsync(
                    staff,
                    HttpMethod.Put,
                    "/api/staff/push/subscription",
                    device.Body("en")
                )
            ).StatusCode
        );
        using var client = host.Browser();
        var csrf = (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;
        await AssertErrorAsync(
            await client.PostAsJsonAsync($"/api/public/r/{shop.Slug}/requests", Body(shop, id)),
            HttpStatusCode.BadRequest,
            "CSRF_VALIDATION_FAILED"
        );
        Assert.Empty(host.VerificationService.Calls);
        await AssertErrorAsync(
            await Submit(client, shop, Body(shop, id, null)),
            HttpStatusCode.BadRequest,
            "ONLINE_VERIFICATION_FAILED"
        );
        Assert.Empty(host.PushService.Requests);
        host.VerificationService.Respond = (_, _) => Task.FromResult(Valid(shop, id));
        Assert.Equal(
            HttpStatusCode.Created,
            (await Submit(client, shop, Body(shop, id))).StatusCode
        );
        Assert.Single(await host.PushService.WaitForAsync(1));
        Assert.Equal(
            HttpStatusCode.OK,
            (await Submit(client, shop, Body(shop, id, null))).StatusCode
        );
        Assert.Single(host.VerificationService.Calls);
        Assert.Single(host.PushService.Requests);
    }

    [Theory]
    [InlineData("Production", true)]
    [InlineData("Development", false)]
    public void Configuration_EnvironmentDefault_IsAppliedWithoutAnExplicitSwitch(
        string environment,
        bool enabled
    )
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.UseSetting("ConnectionStrings:Default", database.ConnectionString);
            builder.UseSetting("Turnstile:SiteKey", "");
            builder.UseSetting("Turnstile:SecretKey", "");
        });
        if (enabled)
            Assert.Throws<OptionsValidationException>(() => factory.CreateClient());
        else
            Assert.False(
                factory.Services.GetRequiredService<IOptions<TurnstileOptions>>().Value.Enabled
            );
    }

    [Fact]
    public void Binding_KnownVector_MatchesBrowserAndDoesNotExposeRecoveryId()
    {
        Assert.Equal(
            "0b54b45d31585cc0beec16d856ff92b9c4efa9f8d211f91f43c70bee113610ff",
            OnlineVerification.Binding(
                Guid.Parse("00000000-0000-4000-8000-000000000010"),
                Guid.Parse("00000000-0000-4000-8000-000000000011")
            )
        );
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("placeholder")]
    [InlineData("test")]
    [InlineData("hostname")]
    public void Configuration_ProductionInvalid_RejectsStartup(string kind)
    {
        using var host = new AccountTestHost(
            database,
            production: true,
            verificationOptions: o =>
            {
                Enabled(o);
                if (kind == "missing")
                    o.SecretKey = null;
                if (kind == "placeholder")
                    o.SiteKey = "REPLACE_WITH_TURNSTILE_SITE_KEY";
                if (kind == "test")
                {
                    o.SiteKey = "1x00000000000000000000AA";
                    o.SecretKey = "1x0000000000000000000000000000000AA";
                }
                if (kind == "hostname")
                    o.Hostname = "https://localhost/path";
            }
        );
        Assert.Throws<OptionsValidationException>(() => host.CreateClient());
    }

    [Fact]
    public async Task Configuration_DevelopmentTestKeys_AcceptsOfficialDummyResponse()
    {
        using var host = new AccountTestHost(
            database,
            verificationOptions: o =>
            {
                o.Enabled = true;
                o.SiteKey = "1x00000000000000000000AA";
                o.SecretKey = "1x0000000000000000000000000000000AA";
            }
        );
        host.Clock.Set(Noon);
        host.VerificationService.Respond = (_, _) =>
            Task.FromResult(
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = JsonContent.Create(new { success = true, hostname = "example.com" }),
                }
            );
        var shop = await SeedShopAsync(database);
        using var client = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (
                await Submit(client, shop, Body(shop, Guid.NewGuid(), "XXXX.DUMMY.TOKEN.XXXX"))
            ).StatusCode
        );
    }
}
