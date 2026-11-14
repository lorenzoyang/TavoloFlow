using System.Data.Common;
using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.OnlineTestData;
using static TavoloFlow.Api.Tests.PushSubscriptionTests;

namespace TavoloFlow.Api.Tests;

public sealed class PushLogoutTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Logout_DeviceEndpoint_DeletesOnlyThisRestaurantsDeviceBeforeSigningOut()
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        var now = host.Clock.GetUtcNow().UtcDateTime;
        var mine = Row(shop, shop.Staff.Id, now);
        var another = Row(shop, shop.Staff.Id, now);
        var theirs = Row(other, other.Staff.Id, now);
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.AddRange(mine, another, theirs);
            await db.SaveChangesAsync();
        }
        using var browser = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PostAsync(browser, "/api/auth/logout", new { pushEndpoint = mine.Endpoint })
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await browser.GetAsync("/api/auth/me")).StatusCode
        );
        await using var check = database.CreateContext();
        Assert.False(await check.PushSubscriptions.AnyAsync(s => s.Id == mine.Id));
        Assert.True(await check.PushSubscriptions.AnyAsync(s => s.Id == another.Id));
        Assert.True(await check.PushSubscriptions.AnyAsync(s => s.Id == theirs.Id));

        // An endpoint owned by another restaurant cannot be removed by this sign-out.
        using var again = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PostAsync(again, "/api/auth/logout", new { pushEndpoint = theirs.Endpoint })
            ).StatusCode
        );
        Assert.True(await check.PushSubscriptions.AnyAsync(s => s.Id == theirs.Id));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Logout_AbsentOrAlreadyRemovedEndpoint_Succeeds(bool includeEndpoint)
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedShopAsync(database);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var browser = await LoginAsync(host, shop.Staff);
            object body = includeEndpoint
                ? new { pushEndpoint = "https://fcm.googleapis.com/missing" }
                : new { };
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await PostAsync(browser, "/api/auth/logout", body)).StatusCode
            );
        }
    }

    [Fact]
    public async Task Logout_FirstPasswordChangeAndOnlineOff_StillRevokesTheDevice()
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedShopAsync(database);
        var row = Row(shop, shop.Staff.Id, host.Clock.GetUtcNow().UtcDateTime);
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.Add(row);
            await db.SaveChangesAsync();
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(set => set.SetProperty(r => r.OnlineEnabled, false));
            await db
                .RestaurantUsers.Where(u => u.Id == shop.Staff.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(u => u.MustChangePassword, true));
        }
        using var browser = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PostAsync(browser, "/api/auth/logout", new { pushEndpoint = row.Endpoint })
            ).StatusCode
        );
        await using var check = database.CreateContext();
        Assert.False(await check.PushSubscriptions.AnyAsync(s => s.Id == row.Id));
    }

    [Fact]
    public async Task Logout_InvalidBody_DoesNotClearTheCookie()
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedShopAsync(database);
        using var browser = await LoginAsync(host, shop.Staff);
        foreach (
            var body in new object[]
            {
                new { pushEndpoint = new string('a', 2049) },
                new { pushEndpoint = Fcm(), extra = true },
            }
        )
        {
            await AssertErrorAsync(
                await PostAsync(browser, "/api/auth/logout", body),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
            Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        }
    }

    [Fact]
    public async Task Logout_RevocationFails_KeepsCookieAndAllowsManualRetry()
    {
        using var baseHost = new AccountTestHost(database);
        var fault = new FailedRevocation();
        using var host = baseHost.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddScoped(_ => new ApplicationDbContext(
                    new DbContextOptionsBuilder<ApplicationDbContext>()
                        .UseNpgsql(database.ConnectionString)
                        .AddInterceptors(fault)
                        .Options
                ))
            )
        );
        var shop = await SeedShopAsync(database);
        var row = Row(shop, shop.Staff.Id, baseHost.Clock.GetUtcNow().UtcDateTime);
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.Add(row);
            await db.SaveChangesAsync();
        }
        using var browser = host.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false,
            }
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(browser, "/api/auth/login", new { shop.Staff.Username, Password })
            ).StatusCode
        );
        var response = await PostAsync(
            browser,
            "/api/auth/logout",
            new { pushEndpoint = row.Endpoint }
        );
        await AssertErrorAsync(response, HttpStatusCode.InternalServerError, "INTERNAL_ERROR");
        Assert.False(
            response.Headers.TryGetValues("Set-Cookie", out var cookies)
                && cookies.Any(cookie => cookie.StartsWith(StoreAuthentication.CookieName + "="))
        );
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        await using var check = database.CreateContext();
        Assert.True(await check.PushSubscriptions.AnyAsync(s => s.Id == row.Id));
        fault.Fail = false;
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PostAsync(browser, "/api/auth/logout", new { pushEndpoint = row.Endpoint })
            ).StatusCode
        );
        Assert.False(await check.PushSubscriptions.AnyAsync(s => s.Id == row.Id));
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await browser.GetAsync("/api/auth/me")).StatusCode
        );
    }

    private sealed class FailedRevocation : DbCommandInterceptor
    {
        public bool Fail { get; set; } = true;

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default
        )
        {
            if (
                Fail
                && command.CommandText.Contains(
                    "DELETE FROM push_subscriptions",
                    StringComparison.Ordinal
                )
            )
                throw new InvalidOperationException("Simulated device revocation failure.");
            return ValueTask.FromResult(result);
        }
    }
}
