using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Push;
using static TavoloFlow.Api.Tests.PlatformAccountTests;
using static TavoloFlow.Api.Tests.SubscriptionTests;

namespace TavoloFlow.Api.Tests;

public sealed class SubscriptionNoticeTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private const string NoticesPath = "/api/platform/subscription-notices";
    private const string DevicePath = "/api/platform/push/subscription";

    [Fact]
    public async Task Migrate_AnnualDemoPeriod_ClearsBillingAndPreservesRestaurant()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        var migrations = db.GetService<IMigrator>();
        await migrations.MigrateAsync("20261121114759_ReservationCancellationReason");
        var restaurantId = Guid.NewGuid();
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO restaurants (id, name, default_language, owner_contact, default_annual_fee_cents)
            VALUES ({restaurantId}, 'Demo Billing', 'it', 'demo contact', 19900);

            INSERT INTO restaurant_subscription_periods
              (id, restaurant_id, starts_on, ends_on, years, amount_cents, paid_on, created_at)
            VALUES ({Guid.NewGuid()}, {restaurantId}, DATE '2026-01-01', DATE '2027-01-01', 1, 19900, DATE '2026-01-01', now());
            """
        );
        await migrations.MigrateAsync();
        var restaurant = await db.Restaurants.SingleAsync();
        Assert.Equal(restaurantId, restaurant.Id);
        Assert.Equal("demo contact", restaurant.OwnerContact);
        Assert.Null(restaurant.DefaultMonthlyFeeCents);
        Assert.False(await db.RestaurantSubscriptionPeriods.AnyAsync());
        Assert.False(await db.SubscriptionNotices.AnyAsync());
    }

    [Fact]
    public async Task RenewalScan_TwoRestaurants_DeduplicatesAndSendsOneBatchPerDevice()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(new DateTimeOffset(2026, 11, 24, 12, 0, 0, TimeSpan.Zero));
        var user = await SeedAsync(database);
        using var administrator = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(administrator, user)).StatusCode);
        using var device = new TestDevice();
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await WriteAsync(administrator, DevicePath, device.Body("it"), HttpMethod.Put)
            ).StatusCode
        );

        var first = await Create(administrator, Period(Guid.NewGuid(), new(2026, 11, 1), 1));
        var second = await Create(administrator, Period(Guid.NewGuid(), new(2026, 11, 1), 1));
        await using var scope = host.Services.CreateAsyncScope();
        var notices = scope.ServiceProvider.GetRequiredService<SubscriptionNotices>();
        var push = scope.ServiceProvider.GetRequiredService<PlatformPushDevices>();
        var created = await notices.CreateRenewalNoticesAsync(default);
        Assert.Equal(2, created);
        await push.SendReminderAsync(created, default);
        var notification = device.Read(Assert.Single(await host.PushService.WaitForAsync(1)));
        Assert.Equal(2, notification.GetProperty("count").GetInt32());
        Assert.Equal("it", notification.GetProperty("language").GetString());
        Assert.Equal(2, notification.EnumerateObject().Count());

        await using var restarted = host.Services.CreateAsyncScope();
        Assert.Equal(
            0,
            await restarted
                .ServiceProvider.GetRequiredService<SubscriptionNotices>()
                .CreateRenewalNoticesAsync(default)
        );

        var items = await administrator.GetFromJsonAsync<JsonElement[]>(NoticesPath);
        Assert.Equal(2, items!.Length);
        Assert.All(items, item => Assert.Equal("DUE_SOON", item.GetProperty("kind").GetString()));
        Assert.Contains(items, n => n.GetProperty("restaurantId").GetGuid() == first.Restaurant.Id);
        Assert.Contains(
            items,
            n => n.GetProperty("restaurantId").GetGuid() == second.Restaurant.Id
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await WriteAsync(
                    administrator,
                    NoticesPath + "/acknowledge",
                    new { ids = items.Select(n => n.GetProperty("id").GetGuid()) }
                )
            ).StatusCode
        );
        using var otherDevice = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(otherDevice, user)).StatusCode);
        Assert.Empty((await otherDevice.GetFromJsonAsync<JsonElement[]>(NoticesPath))!);
        using var anotherAdmin = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await LoginAsync(anotherAdmin, await SeedAsync(database))).StatusCode
        );
        Assert.Equal(2, (await anotherAdmin.GetFromJsonAsync<JsonElement[]>(NoticesPath))!.Length);

        host.Clock.Advance(TimeSpan.FromDays(7));
        Assert.Equal(2, await notices.CreateRenewalNoticesAsync(default));
        var expired = await anotherAdmin.GetFromJsonAsync<JsonElement[]>(NoticesPath);
        Assert.Equal(2, expired!.Length);
        Assert.All(expired, item => Assert.Equal("EXPIRED", item.GetProperty("kind").GetString()));

        host.Clock.Advance(TimeSpan.FromDays(23));
        await push.SendReminderAsync(2, default);
        Assert.Single(host.PushService.Requests);
        await using var db = database.CreateContext();
        Assert.False(await db.PlatformPushSubscriptions.AnyAsync());
    }

    [Fact]
    public async Task PlatformLogout_RevokesOnlyItsDevice()
    {
        using var host = new AccountTestHost(database, push: true);
        using var administrator = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await LoginAsync(administrator, await SeedAsync(database))).StatusCode
        );
        using var device = new TestDevice();
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await WriteAsync(administrator, DevicePath, device.Body(), HttpMethod.Put)).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await WriteAsync(
                    administrator,
                    "/api/platform/auth/logout",
                    new { pushEndpoint = device.Endpoint }
                )
            ).StatusCode
        );
        await using var db = database.CreateContext();
        Assert.False(
            await db.PlatformPushSubscriptions.AnyAsync(s => s.Endpoint == device.Endpoint)
        );
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await administrator.GetAsync(NoticesPath)).StatusCode
        );
    }
}
