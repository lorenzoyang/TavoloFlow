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
using TavoloFlow.Api.Pickup;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class RestaurantServicesTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Services-test-password-123";

    private sealed record Setup(RestaurantUser Owner, RestaurantUser Staff, RestaurantTable Table, RestaurantTable Second, MenuItem Item)
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

    [Fact]
    public async Task PlatformServices_ContactAndOpenWork_GuardEveryChange()
    {
        using var host = new AccountTestHost(database);
        using var admin = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PlatformAccountTests.LoginAsync(admin, await PlatformAccountTests.SeedAsync(database))).StatusCode);
        CreateRestaurantInput Input() => new(Guid.NewGuid(), "自取测试", "it", $"owner.{Guid.NewGuid():N}", $"staff.{Guid.NewGuid():N}");
        Task<HttpResponseMessage> Write(string path, object body, HttpMethod? method = null) =>
            PlatformAccountTests.WriteAsync(admin, path, body, method);

        await AssertErrorAsync(await Write("/api/platform/restaurants", Input() with { DineInEnabled = false }),
            HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await Write("/api/platform/restaurants", Input() with { PickupEnabled = true, Phone = "333 1234567" }),
            HttpStatusCode.Conflict, "PICKUP_CONTACT_REQUIRED");
        var slug = $"t-{Guid.NewGuid():N}"[..20];
        var created = await Write("/api/platform/restaurants", Input() with
            { DineInEnabled = false, PickupEnabled = true, Phone = " +39 333 123 4567 ", Slug = slug.ToUpperInvariant() });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var pickupOnly = (await created.Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant;
        Assert.Equal((false, true, "+393331234567", slug, false),
            (pickupOnly.DineInEnabled, pickupOnly.PickupEnabled, pickupOnly.Phone, pickupOnly.Slug, pickupOnly.PickupPaused));
        await AssertErrorAsync(await Write("/api/platform/restaurants", Input() with { Slug = slug }), HttpStatusCode.Conflict, "SLUG_TAKEN");

        var dineIn = (await (await Write("/api/platform/restaurants", Input())).Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant;
        var path = $"/api/platform/restaurants/{dineIn.Id}";
        await AssertErrorAsync(await Write(path + "/services", new { dineIn = false, pickup = false }, HttpMethod.Patch),
            HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await Write(path + "/services", new { dineIn = true, pickup = true }, HttpMethod.Patch),
            HttpStatusCode.Conflict, "PICKUP_CONTACT_REQUIRED");
        foreach (var (field, value) in new[] { ("phone", "12345"), ("phone", "+39-333"), ("slug", "-ab"), ("slug", "ab"), ("slug", "a_b-c") })
            await AssertErrorAsync(await Write($"{path}/{field}", new Dictionary<string, string> { [field] = value }, HttpMethod.Patch),
                HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await Write(path + "/slug", new { slug }, HttpMethod.Patch), HttpStatusCode.Conflict, "SLUG_TAKEN");
        Assert.Equal(HttpStatusCode.OK, (await Write(path + "/phone", new { phone = "0612345678" }, HttpMethod.Patch)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Write(path + "/slug", new { slug = slug + "-2" }, HttpMethod.Patch)).StatusCode);
        var both = (await (await Write(path + "/services", new { dineIn = true, pickup = true }, HttpMethod.Patch))
            .Content.ReadFromJsonAsync<RestaurantSummary>())!;
        Assert.Equal((true, true, "0612345678", slug + "-2"), (both.DineInEnabled, both.PickupEnabled, both.Phone, both.Slug));
        await AssertErrorAsync(await Write(path + "/phone", new { phone = " " }, HttpMethod.Patch), HttpStatusCode.Conflict, "PICKUP_CONTACT_REQUIRED");
        await AssertErrorAsync(await Write(path + "/slug", new { slug = (string?)null }, HttpMethod.Patch), HttpStatusCode.Conflict, "PICKUP_CONTACT_REQUIRED");

        // An open visit of a service keeps that service on.
        await using (var db = database.CreateContext())
        {
            var table = new RestaurantTable { RestaurantId = dineIn.Id, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N") };
            db.RestaurantTables.Add(table);
            db.DiningSessions.AddRange(
                new DiningSession { RestaurantId = dineIn.Id, Table = table, TableLabelSnapshot = "1", JoinCodeCiphertext = "test-only" },
                new DiningSession { RestaurantId = dineIn.Id, Channel = SessionChannel.Pickup });
            await db.SaveChangesAsync();
        }
        await AssertErrorAsync(await Write(path + "/services", new { dineIn = false, pickup = true }, HttpMethod.Patch),
            HttpStatusCode.Conflict, "SERVICE_HAS_OPEN_WORK");
        await AssertErrorAsync(await Write(path + "/services", new { dineIn = true, pickup = false }, HttpMethod.Patch),
            HttpStatusCode.Conflict, "SERVICE_HAS_OPEN_WORK");
        await using (var db = database.CreateContext())
            await db.DiningSessions.Where(x => x.RestaurantId == dineIn.Id).ExecuteUpdateAsync(u => u
                .SetProperty(x => x.Status, DiningSessionStatus.Closed).SetProperty(x => x.ClosedAt, DateTime.UtcNow)
                .SetProperty(x => x.CloseReason, SessionCloseReason.Voided).SetProperty(x => x.ClosedTotalCents, 0L)
                .SetProperty(x => x.JoinCodeCiphertext, (string?)null));
        var dineInOff = (await (await Write(path + "/services", new { dineIn = false, pickup = true }, HttpMethod.Patch))
            .Content.ReadFromJsonAsync<RestaurantSummary>())!;
        Assert.Equal((false, true), (dineInOff.DineInEnabled, dineInOff.PickupEnabled));
    }

    [Fact]
    public async Task PickupSettings_StaffPausesOwnerSavesHours_StatusFollows()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        using var owner = await LoginAsync(host, s.Owner);
        await AssertErrorAsync(await WriteAsync(staff, "/api/staff/pickup/paused", new { paused = true }, HttpMethod.Patch),
            HttpStatusCode.Conflict, "PICKUP_NOT_OFFERED");
        Assert.Equal("NOT_OFFERED", (await staff.GetFromJsonAsync<PickupSettingsResponse>("/api/staff/pickup/settings"))!.Status);
        await SetServicesAsync(s.RestaurantId, dineIn: true, pickup: true);

        var settings = (await staff.GetFromJsonAsync<PickupSettingsResponse>("/api/staff/pickup/settings"))!;
        Assert.Equal(("CLOSED_HOURS", (DateTime?)null, "Europe/Rome", "0612345678"), (settings.Status, settings.NextOpensAt, settings.TimeZone, settings.Phone));
        Assert.Empty(settings.Hours);
        object Week(int opens, int closes) => new { hours = Enumerable.Range(1, 7).Select(d => new { weekday = d, slot = 1, opensMinute = opens, closesMinute = closes }) };
        await AssertErrorAsync(await WriteAsync(staff, "/api/owner/pickup/hours", Week(0, 1440), HttpMethod.Put),
            HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await WriteAsync(owner, "/api/owner/pickup/hours", Week(600, 600), HttpMethod.Put),
            HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        var open = await (await WriteAsync(owner, "/api/owner/pickup/hours", Week(0, 1440), HttpMethod.Put))
            .Content.ReadFromJsonAsync<PickupSettingsResponse>();
        Assert.Equal(("OPEN", 7), (open!.Status, open.Hours.Length));
        var paused = await (await WriteAsync(staff, "/api/staff/pickup/paused", new { paused = true }, HttpMethod.Patch))
            .Content.ReadFromJsonAsync<PickupSettingsResponse>();
        Assert.Equal(("PAUSED", true), (paused!.Status, paused.Paused));
        // Saving again replaces the whole week.
        var replaced = await (await WriteAsync(owner, "/api/owner/pickup/hours", new { hours = Array.Empty<object>() }, HttpMethod.Put))
            .Content.ReadFromJsonAsync<PickupSettingsResponse>();
        Assert.Empty(replaced!.Hours);
        await using var db = database.CreateContext();
        Assert.False(await db.PickupHours.AnyAsync(h => h.RestaurantId == s.RestaurantId));
    }

    [Fact]
    public async Task PlatformServices_PickupRequests_PendingBlocksTurningOffAndExpiredDoesNot()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync();
        await SetServicesAsync(s.RestaurantId, dineIn: true, pickup: true);
        var now = host.Clock.GetUtcNow().UtcDateTime;
        await using (var db = database.CreateContext())
        {
            db.PickupRequests.Add(new PickupRequest { RestaurantId = s.RestaurantId, ClientRequestId = Guid.NewGuid(),
                StatusToken = Guid.NewGuid().ToString("N"), BusinessDate = DateOnly.FromDateTime(now), PickupNumber = 1,
                CustomerName = "Anna", CustomerPhone = "3471234567", TotalAmountCents = 700, DefaultLanguageSnapshot = "it",
                SubmittedAt = now, ExpiresAt = now + PickupState.Lifetime });
            await db.SaveChangesAsync();
        }
        using var admin = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PlatformAccountTests.LoginAsync(admin, await PlatformAccountTests.SeedAsync(database))).StatusCode);
        var path = $"/api/platform/restaurants/{s.RestaurantId}/services";
        await AssertErrorAsync(await PlatformAccountTests.WriteAsync(admin, path, new { dineIn = true, pickup = false }, HttpMethod.Patch),
            HttpStatusCode.Conflict, "SERVICE_HAS_OPEN_WORK");
        // Nothing is written when a request expires; the check must still stop counting it.
        host.Clock.Advance(PickupState.Lifetime);
        Assert.Equal(HttpStatusCode.OK, (await PlatformAccountTests.WriteAsync(admin, path, new { dineIn = true, pickup = false }, HttpMethod.Patch)).StatusCode);
    }

    // Pickup needs a phone and an online menu link; the test gives every restaurant the same ones when it turns pickup on.
    private async Task SetServicesAsync(Guid restaurantId, bool dineIn, bool pickup)
    {
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == restaurantId).ExecuteUpdateAsync(u => u
            .SetProperty(r => r.Phone, r => r.Phone ?? "0612345678")
            .SetProperty(r => r.Slug, r => r.Slug ?? "r-" + r.Id.ToString().Replace("-", ""))
            .SetProperty(r => r.DineInEnabled, dineIn).SetProperty(r => r.PickupEnabled, pickup));
    }

    private static async Task<HttpResponseMessage> WriteAsync(HttpClient client, string path, object body, HttpMethod method)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private async Task<Setup> SeedAsync()
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Services test", DefaultLanguage = "it",
            ServiceStatus = RestaurantServiceStatus.Active, OrderingEnabled = true, JoinCodeRequired = false };
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser { Restaurant = restaurant, Username = "services." + Guid.NewGuid().ToString("N"),
                PasswordHash = "", Role = role, MustChangePassword = false };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
            return user;
        }
        var owner = User(RestaurantUserRole.Owner);
        var staff = User(RestaurantUserRole.Staff);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N") };
        var second = new RestaurantTable { Restaurant = restaurant, TableLabel = "2", QrToken = Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", PriceCents = 700, AllergenReviewed = true };
        db.RestaurantUsers.AddRange(owner, staff);
        db.RestaurantTables.AddRange(table, second);
        db.MenuItems.Add(item);
        await db.SaveChangesAsync();
        return new(owner, staff, table, second, item);
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
