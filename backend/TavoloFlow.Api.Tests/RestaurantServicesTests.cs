using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class RestaurantServicesTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Services-test-password-123";

    private sealed record Setup(RestaurantUser Staff, RestaurantTable Table, RestaurantTable Second, MenuItem Item)
    {
        public Guid RestaurantId => Staff.RestaurantId;
    }

    [Fact]
    public async Task Me_DefaultServices_ReturnsDineInOnly()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        var me = (await staff.GetFromJsonAsync<CurrentAccountResponse>("/api/auth/me"))!;
        Assert.Equal(new RestaurantServices(true, false), me.Services);
    }

    [Fact]
    public async Task DineInEntrances_ServiceOff_RejectOpeningJoiningAndOrdering()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        var open = await PostAsync(staff, $"/api/staff/tables/{s.Table.Id}/open", new { });
        Assert.Equal(HttpStatusCode.Created, open.StatusCode);
        var opened = (await open.Content.ReadFromJsonAsync<OpenSessionResponse>())!;
        using var guest = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, s.Table, opened)).StatusCode);

        // The platform refuses this while a dine-in visit is open; the database write isolates the entrance rule.
        await SetServicesAsync(s.RestaurantId, dineIn: false, pickup: true);

        await AssertErrorAsync(await PostAsync(staff, $"/api/staff/tables/{s.Second.Id}/open", new { }),
            HttpStatusCode.Conflict, "DINE_IN_NOT_OFFERED");
        using var stranger = host.Browser();
        await AssertErrorAsync(await JoinAsync(stranger, s.Table, opened), HttpStatusCode.Conflict, "DINE_IN_NOT_OFFERED");
        var order = new CreateOrderInput(opened.Session.SessionId, Guid.NewGuid(), [new(s.Item.Id, 1, 700, null)]);
        await AssertErrorAsync(await PostAsync(guest, "/api/public/orders", order, await GuestCsrfAsync(guest)),
            HttpStatusCode.Conflict, "DINE_IN_NOT_OFFERED");
        await AssertErrorAsync(await guest.GetAsync($"/api/public/sessions/{opened.Session.SessionId}/join-code"),
            HttpStatusCode.Conflict, "DINE_IN_NOT_OFFERED");

        // The QR page still shows the menu, with the service state to explain why ordering is unavailable.
        var menu = (await host.Browser().GetFromJsonAsync<PublicMenuResponse>($"/api/public/qr/{s.Table.QrToken}/bootstrap"))!;
        Assert.False(menu.Restaurant.DineInEnabled);
        Assert.Single(menu.Menu.Items);
        var me = (await staff.GetFromJsonAsync<CurrentAccountResponse>("/api/auth/me"))!;
        Assert.Equal(new RestaurantServices(false, true), me.Services);
    }

    [Fact]
    public async Task Services_BothOff_ViolatesDatabaseConstraint()
    {
        var s = await SeedAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(() => SetServicesAsync(s.RestaurantId, dineIn: false, pickup: false));
        Assert.Equal("ck_restaurant_services", error.ConstraintName);
    }

    [Fact]
    public async Task PickupSession_WithoutTable_IsListedByChannelAndHasNoJoinCode()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync();
        await using (var db = database.CreateContext())
        {
            var session = new DiningSession { Id = Guid.CreateVersion7(), RestaurantId = s.RestaurantId, Channel = SessionChannel.Pickup,
                OpenedAt = host.Clock.GetUtcNow().UtcDateTime };
            session.Orders.Add(new Order { Id = Guid.CreateVersion7(), RestaurantId = s.RestaurantId, ClientRequestId = Guid.NewGuid(),
                TotalAmountCents = 700, DefaultLanguageSnapshot = "it", CreatedAt = session.OpenedAt,
                Items = { new OrderItem { Id = Guid.CreateVersion7(), RestaurantId = s.RestaurantId, MenuItemId = s.Item.Id,
                    NameZhSnapshot = "炒饭", UnitPriceCents = 700, Quantity = 1 } } });
            db.DiningSessions.Add(session);
            await db.SaveChangesAsync();
        }
        using var staff = await LoginAsync(host, s.Staff);
        var order = Assert.Single((await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders"))!.Items);
        Assert.Equal("PICKUP", order.Channel);
        Assert.Null(order.TableLabel);
        var bill = (await staff.GetFromJsonAsync<BillSummaryResponse>($"/api/staff/sessions/{order.SessionId}"))!;
        Assert.Equal(("PICKUP", (Guid?)null, (string?)null), (bill.Channel, bill.TableId, bill.TableLabel));
        await AssertErrorAsync(await staff.GetAsync($"/api/staff/sessions/{order.SessionId}/join-code"),
            HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        // The floor starts from tables, so a pickup visit never appears there.
        Assert.All((await staff.GetFromJsonAsync<FloorResponse>("/api/staff/floor"))!.Tables, t => Assert.Null(t.Session));
    }

    private async Task SetServicesAsync(Guid restaurantId, bool dineIn, bool pickup)
    {
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == restaurantId).ExecuteUpdateAsync(u => u
            .SetProperty(r => r.DineInEnabled, dineIn).SetProperty(r => r.PickupEnabled, pickup));
    }

    private async Task<Setup> SeedAsync()
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Services test", DefaultLanguage = "it",
            ServiceStatus = RestaurantServiceStatus.Active, OrderingEnabled = true, JoinCodeRequired = false };
        var staff = new RestaurantUser { Restaurant = restaurant, Username = "services." + Guid.NewGuid().ToString("N"),
            PasswordHash = "", Role = RestaurantUserRole.Staff, MustChangePassword = false };
        staff.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(staff, Password);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N") };
        var second = new RestaurantTable { Restaurant = restaurant, TableLabel = "2", QrToken = Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", PriceCents = 700, AllergenReviewed = true };
        db.RestaurantUsers.Add(staff);
        db.RestaurantTables.AddRange(table, second);
        db.MenuItems.Add(item);
        await db.SaveChangesAsync();
        return new(staff, table, second, item);
    }

    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode);
        return client;
    }

    private static async Task<string> GuestCsrfAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<CsrfToken>("/api/public/csrf"))!.Token;

    private static async Task<HttpResponseMessage> JoinAsync(HttpClient client, RestaurantTable table, OpenSessionResponse opened) =>
        await PostAsync(client, $"/api/public/qr/{table.QrToken}/join", new JoinInput(opened.Session.SessionId, opened.JoinCode),
            await GuestCsrfAsync(client));

    private sealed record CsrfToken(string Token);
}
