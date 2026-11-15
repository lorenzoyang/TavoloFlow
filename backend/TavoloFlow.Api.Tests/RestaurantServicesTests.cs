using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.PlatformAccountTests;

namespace TavoloFlow.Api.Tests;

public sealed class RestaurantServicesTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private const string StorePassword = "Services-test-password-123";

    private static string Slug() => $"ristorante-{Guid.NewGuid():N}"[..30];

    private static object CreateBody(object services, string? slug = null) =>
        new
        {
            id = Guid.NewGuid(),
            name = "Servizi",
            defaultLanguage = "it",
            ownerUsername = $"owner.{Guid.NewGuid():N}",
            staffUsername = $"staff.{Guid.NewGuid():N}",
            services,
            slug,
        };

    private async Task<HttpClient> Admin(AccountTestHost host)
    {
        var browser = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await LoginAsync(browser, await SeedAsync(database))).StatusCode
        );
        return browser;
    }

    private static async Task<RestaurantSummary> Summary(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RestaurantSummary>())!;
    }

    [Fact]
    public async Task Create_ServicesAndSlug_ValidatesAndKeepsSlugsUnique()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        const string path = "/api/platform/restaurants";
        foreach (
            var invalid in new[]
            {
                CreateBody(new { dineIn = false, online = false }),
                CreateBody(new { dineIn = true, online = true }),
                CreateBody(new { dineIn = true }),
                CreateBody(new { dineIn = true, online = false }, "Bad Slug"),
                CreateBody(new { dineIn = false, online = true }, "-ramen"),
                CreateBody(new { dineIn = false, online = true }, "ab"),
            }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, path, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                path,
                new
                {
                    id = Guid.NewGuid(),
                    name = "Servizi",
                    defaultLanguage = "it",
                    ownerUsername = $"owner.{Guid.NewGuid():N}",
                    staffUsername = $"staff.{Guid.NewGuid():N}",
                }
            ),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );

        var dineIn = await WriteAsync(
            admin,
            path,
            CreateBody(new { dineIn = true, online = false })
        );
        Assert.Equal(HttpStatusCode.Created, dineIn.StatusCode);
        var plain = (await dineIn.Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant;
        Assert.Equal(new RestaurantServices(true, false), plain.Services);
        Assert.Null(plain.Slug);

        var slug = Slug();
        var online = await WriteAsync(
            admin,
            path,
            CreateBody(new { dineIn = false, online = true }, $" {slug} ")
        );
        Assert.Equal(HttpStatusCode.Created, online.StatusCode);
        var created = (await online.Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant;
        Assert.Equal(new RestaurantServices(false, true), created.Services);
        Assert.Equal(slug, created.Slug);

        var duplicate = CreateBody(new { dineIn = true, online = true }, slug);
        await AssertErrorAsync(
            await WriteAsync(admin, path, duplicate),
            HttpStatusCode.Conflict,
            "SLUG_CONFLICT"
        );
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.Restaurants.CountAsync(r => r.Slug == slug));
    }

    [Fact]
    public async Task SetServicesAndSlug_ValidTargets_UpdatesAndRejectsInvalidOrTakenValues()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var created = await WriteAsync(
            admin,
            "/api/platform/restaurants",
            CreateBody(new { dineIn = true, online = false })
        );
        var id = (await created.Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant.Id;
        var services = $"/api/platform/restaurants/{id}/services";
        var slugPath = $"/api/platform/restaurants/{id}/slug";

        // Online ordering needs a link first.
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                services,
                new { dineIn = true, online = true },
                HttpMethod.Patch
            ),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        foreach (
            var invalid in new object[]
            {
                new { },
                new { slug = (string?)null },
                new { slug = "" },
                new { slug = "UPPER" },
                new { slug = "ends-" },
                new { slug = new string('a', 41) },
                new { slug = "ok-slug", extra = true },
            }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, slugPath, invalid, HttpMethod.Patch),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        var slug = Slug();
        Assert.Equal(
            slug,
            (await Summary(await WriteAsync(admin, slugPath, new { slug }, HttpMethod.Patch))).Slug
        );
        var both = await Summary(
            await WriteAsync(
                admin,
                services,
                new { dineIn = true, online = true },
                HttpMethod.Patch
            )
        );
        Assert.Equal(new RestaurantServices(true, true), both.Services);
        var onlineOnly = await Summary(
            await WriteAsync(
                admin,
                services,
                new { dineIn = false, online = true },
                HttpMethod.Patch
            )
        );
        Assert.Equal(new RestaurantServices(false, true), onlineOnly.Services);
        foreach (
            var invalid in new object[]
            {
                new { dineIn = false, online = false },
                new { dineIn = true },
                new
                {
                    dineIn = true,
                    online = true,
                    slug,
                },
            }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, services, invalid, HttpMethod.Patch),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        var other = await WriteAsync(
            admin,
            "/api/platform/restaurants",
            CreateBody(new { dineIn = true, online = false })
        );
        var otherId = (await other.Content.ReadFromJsonAsync<CreatedRestaurant>())!.Restaurant.Id;
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{otherId}/slug",
                new { slug },
                HttpMethod.Patch
            ),
            HttpStatusCode.Conflict,
            "SLUG_CONFLICT"
        );
        // Repeating the current value is not a conflict with itself.
        Assert.Equal(
            slug,
            (await Summary(await WriteAsync(admin, slugPath, new { slug }, HttpMethod.Patch))).Slug
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{Guid.NewGuid()}/services",
                new { dineIn = true, online = false },
                HttpMethod.Patch
            ),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{Guid.NewGuid()}/slug",
                new { slug = Slug() },
                HttpMethod.Patch
            ),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );

        // Store accounts cannot use platform writes.
        var (user, _) = await SeedStoreAsync(RestaurantUserRole.Owner);
        using var owner = await StoreLoginAsync(host, user);
        await AssertErrorAsync(
            await WriteAsync(
                owner,
                services,
                new { dineIn = true, online = false },
                HttpMethod.Patch
            ),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
    }

    [Fact]
    public async Task SetServices_ActiveDineInVisit_KeepsDineInUntilTheVisitCloses()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var (user, table) = await SeedStoreAsync(RestaurantUserRole.Staff, slug: Slug());
        using var staff = await StoreLoginAsync(host, user);
        var opened = await PostAsync(staff, $"/api/staff/tables/{table.Id}/open", new { });
        Assert.Equal(HttpStatusCode.Created, opened.StatusCode);
        var path = $"/api/platform/restaurants/{user.RestaurantId}/services";
        await AssertErrorAsync(
            await WriteAsync(admin, path, new { dineIn = false, online = true }, HttpMethod.Patch),
            HttpStatusCode.Conflict,
            "SERVICE_HAS_OPEN_WORK"
        );
        // Turning on another service never needs the check.
        Assert.Equal(
            new RestaurantServices(true, true),
            (
                await Summary(
                    await WriteAsync(
                        admin,
                        path,
                        new { dineIn = true, online = true },
                        HttpMethod.Patch
                    )
                )
            ).Services
        );
        await using (var db = database.CreateContext())
            await db
                .DiningSessions.Where(s => s.RestaurantId == user.RestaurantId)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(s => s.Status, DiningSessionStatus.Closed)
                        .SetProperty(s => s.CloseReason, SessionCloseReason.Empty)
                        .SetProperty(s => s.ClosedAt, s => s.OpenedAt)
                        .SetProperty(s => s.ClosedTotalCents, 0L)
                        .SetProperty(s => s.JoinCodeCiphertext, (string?)null)
                );
        Assert.Equal(
            new RestaurantServices(false, true),
            (
                await Summary(
                    await WriteAsync(
                        admin,
                        path,
                        new { dineIn = false, online = true },
                        HttpMethod.Patch
                    )
                )
            ).Services
        );
    }

    [Fact]
    public async Task SetServices_OnlineOpenWork_OnlyWaitingRequestsAndActiveOnlineSessionsBlock()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var (user, _) = await SeedStoreAsync(RestaurantUserRole.Owner, slug: Slug());
        var path = $"/api/platform/restaurants/{user.RestaurantId}/services";
        async Task<HttpResponseMessage> Set(bool dineIn, bool online) =>
            await WriteAsync(admin, path, new { dineIn, online }, HttpMethod.Patch);
        await Summary(await Set(true, true));
        var now = host.Clock.GetUtcNow().UtcDateTime;
        await using (var db = database.CreateContext())
        {
            // Expired and rejected requests are finished: they never keep online ordering on.
            var expired = OnlineTestData.Request(user.RestaurantId, now.AddMinutes(-10), 1);
            var rejected = OnlineTestData.Request(user.RestaurantId, now, 2);
            rejected.RejectedAt = now;
            db.OnlineRequests.AddRange(expired, rejected);
            await db.SaveChangesAsync();
        }
        Assert.Equal(
            new RestaurantServices(true, false),
            (await Summary(await Set(true, false))).Services
        );
        await Summary(await Set(true, true));

        await using (var db = database.CreateContext())
        {
            db.OnlineRequests.Add(OnlineTestData.Request(user.RestaurantId, now, 3));
            await db.SaveChangesAsync();
        }
        await AssertErrorAsync(
            await Set(true, false),
            HttpStatusCode.Conflict,
            "SERVICE_HAS_OPEN_WORK"
        );
        // The request expires exactly ten minutes after submission and stops counting at that instant.
        host.Clock.Advance(TimeSpan.FromMinutes(10));
        await Summary(await Set(true, false));
        await Summary(await Set(true, true));

        // An accepted online order stays open work for online ordering until it closes, but not for dine-in.
        await using (var db = database.CreateContext())
        {
            var accepted = OnlineTestData.Request(
                user.RestaurantId,
                host.Clock.GetUtcNow().UtcDateTime,
                4
            );
            db.AddRange(
                accepted,
                OnlineTestData.Accept(accepted, accepted.SubmittedAt, menuItemExists: false)
            );
            await db.SaveChangesAsync();
        }
        await AssertErrorAsync(
            await Set(true, false),
            HttpStatusCode.Conflict,
            "SERVICE_HAS_OPEN_WORK"
        );
        Assert.Equal(
            new RestaurantServices(false, true),
            (await Summary(await Set(false, true))).Services
        );
    }

    [Fact]
    public async Task DineInOff_StoreAndGuestEntrances_RejectedWhileMenuAndIdentityStayReadable()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedStoreAsync(RestaurantUserRole.Staff, slug: Slug());
        using var staff = await StoreLoginAsync(host, user);
        var openedResponse = await PostAsync(staff, $"/api/staff/tables/{table.Id}/open", new { });
        var opened = (await openedResponse.Content.ReadFromJsonAsync<OpenSessionResponse>())!;
        using var guest = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    guest,
                    $"/api/public/qr/{table.QrToken}/join",
                    new JoinInput(opened.Session.SessionId, opened.JoinCode),
                    await GuestCsrf(guest)
                )
            ).StatusCode
        );
        var me = await staff.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.True(me.GetProperty("services").GetProperty("dineIn").GetBoolean());
        Assert.False(me.GetProperty("services").GetProperty("online").GetBoolean());

        // A visit that was open before the switch cannot happen through the API; write it directly
        // to prove every entrance checks the switch on its own.
        await using (var db = database.CreateContext())
            await db
                .Restaurants.Where(r => r.Id == user.RestaurantId)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(r => r.DineInEnabled, false)
                        .SetProperty(r => r.OnlineEnabled, true)
                );

        var item = await AddItemAsync(user.RestaurantId);
        await AssertErrorAsync(
            await PostAsync(
                guest,
                "/api/public/orders",
                new CreateOrderInput(
                    opened.Session.SessionId,
                    Guid.NewGuid(),
                    [new(item.Id, 1, item.PriceCents, null, [])]
                ),
                await GuestCsrf(guest)
            ),
            HttpStatusCode.Conflict,
            "DINE_IN_NOT_OFFERED"
        );
        using var other = host.Browser();
        await AssertErrorAsync(
            await PostAsync(
                other,
                $"/api/public/qr/{table.QrToken}/join",
                new JoinInput(opened.Session.SessionId, opened.JoinCode),
                await GuestCsrf(other)
            ),
            HttpStatusCode.Conflict,
            "DINE_IN_NOT_OFFERED"
        );
        await AssertErrorAsync(
            await guest.GetAsync($"/api/public/sessions/{opened.Session.SessionId}/join-code"),
            HttpStatusCode.Conflict,
            "DINE_IN_NOT_OFFERED"
        );
        var (_, secondTable) = await AddTableAsync(user.RestaurantId);
        await AssertErrorAsync(
            await PostAsync(staff, $"/api/staff/tables/{secondTable.Id}/open", new { }),
            HttpStatusCode.Conflict,
            "DINE_IN_NOT_OFFERED"
        );
        await AssertErrorAsync(
            await PatchAsync(staff, "/api/staff/accepting-orders", new { enabled = true }),
            HttpStatusCode.Conflict,
            "DINE_IN_NOT_OFFERED"
        );
        // Pausing stays possible, and the floor read still serves the bills page and notices.
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PatchAsync(staff, "/api/staff/accepting-orders", new { enabled = false })
            ).StatusCode
        );
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/staff/floor")).StatusCode);

        using var anonymous = host.Browser();
        var bootstrap = (
            await anonymous.GetFromJsonAsync<PublicMenuResponse>(
                $"/api/public/qr/{table.QrToken}/bootstrap"
            )
        )!;
        Assert.False(bootstrap.Restaurant.DineInEnabled);
        Assert.Contains(bootstrap.Menu.Items, x => x.Id == item.Id);
        me = await staff.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.False(me.GetProperty("services").GetProperty("dineIn").GetBoolean());
        Assert.True(me.GetProperty("services").GetProperty("online").GetBoolean());
    }

    // Opening holds restaurant SHARE until it commits; turning dine-in off takes restaurant UPDATE.
    // Whichever locks first, the other observes its result: no visit opens after dine-in is off.
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SetServices_RacingOpen_NeverLeavesAVisitWithoutDineIn(bool openFirst)
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedStoreAsync(RestaurantUserRole.Staff, slug: Slug());
        var gate = openFirst
            ? new LockGate("FROM restaurant_tables", "FOR UPDATE", hold: true)
            : new LockGate("FROM restaurants", "FOR UPDATE", hold: true);
        var waiting = openFirst
            ? new LockGate("FROM restaurants", "FOR UPDATE", hold: false)
            : new LockGate("FROM restaurants", "FOR SHARE", hold: false);
        await using var firstDb = Intercepted(gate);
        await using var secondDb = Intercepted(waiting);
        var openDb = openFirst ? firstDb : secondDb;
        var servicesDb = openFirst ? secondDb : firstDb;
        async Task<object> Open() =>
            await new DiningService(
                openDb,
                host.Services.GetRequiredService<JoinCodes>(),
                host.Clock
            ).OpenAsync(user.RestaurantId, table.Id, default);
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
            ).SetServicesAsync(user.RestaurantId, new(false, true), Guid.NewGuid(), default);
        var first = openFirst ? Open() : TurnOff();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = openFirst ? TurnOff() : Open();
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
        var restaurant = await check.Restaurants.SingleAsync(r => r.Id == user.RestaurantId);
        var visits = await check.DiningSessions.CountAsync(s =>
            s.RestaurantId == user.RestaurantId
        );
        if (openFirst)
        {
            Assert.Equal("SERVICE_HAS_OPEN_WORK", error.Code);
            Assert.True(restaurant.DineInEnabled);
            Assert.Equal(1, visits);
        }
        else
        {
            Assert.Equal("DINE_IN_NOT_OFFERED", error.Code);
            Assert.False(restaurant.DineInEnabled);
            Assert.Equal(0, visits);
        }
    }

    [Fact]
    public async Task Database_ServiceConstraints_RejectRowsWithoutServiceOrOnlineLink()
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Constraint", DefaultLanguage = "it" };
        db.Restaurants.Add(restaurant);
        await db.SaveChangesAsync();
        await Assert.ThrowsAnyAsync<Exception>(() =>
            db
                .Restaurants.Where(r => r.Id == restaurant.Id)
                .ExecuteUpdateAsync(u =>
                    u.SetProperty(r => r.DineInEnabled, false)
                        .SetProperty(r => r.OnlineEnabled, false)
                )
        );
        await Assert.ThrowsAnyAsync<Exception>(() =>
            db
                .Restaurants.Where(r => r.Id == restaurant.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlineEnabled, true))
        );
        await Assert.ThrowsAnyAsync<Exception>(() =>
            db
                .Restaurants.Where(r => r.Id == restaurant.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.Slug, "Not-Valid"))
        );
    }

    private async Task<(RestaurantUser, RestaurantTable)> SeedStoreAsync(
        RestaurantUserRole role,
        string? slug = null
    )
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant
        {
            Name = "Services test",
            DefaultLanguage = "it",
            ServiceStatus = RestaurantServiceStatus.Active,
            OrderingEnabled = true,
            Slug = slug,
        };
        var user = new RestaurantUser
        {
            Restaurant = restaurant,
            Username = "services." + Guid.NewGuid().ToString("N"),
            PasswordHash = "",
            Role = role,
            MustChangePassword = false,
        };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, StorePassword);
        var table = new RestaurantTable
        {
            Restaurant = restaurant,
            TableLabel = "1",
            QrToken = Guid.NewGuid().ToString("N"),
        };
        db.RestaurantUsers.Add(user);
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();
        return (user, table);
    }

    private async Task<(Guid, RestaurantTable)> AddTableAsync(Guid restaurantId)
    {
        await using var db = database.CreateContext();
        var table = new RestaurantTable
        {
            RestaurantId = restaurantId,
            TableLabel = "2",
            QrToken = Guid.NewGuid().ToString("N"),
        };
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();
        return (restaurantId, table);
    }

    private async Task<MenuItem> AddItemAsync(Guid restaurantId)
    {
        await using var db = database.CreateContext();
        var category = new MenuCategory { RestaurantId = restaurantId, NameZh = "面" };
        var item = new MenuItem
        {
            RestaurantId = restaurantId,
            Category = category,
            NameZh = "拉面",
            PriceCents = 1200,
            AllergenReviewed = true,
        };
        db.MenuItems.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    private static async Task<HttpClient> StoreLoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    client,
                    "/api/auth/login",
                    new { user.Username, Password = StorePassword }
                )
            ).StatusCode
        );
        return client;
    }

    private static async Task<HttpResponseMessage> PatchAsync(
        HttpClient client,
        string path,
        object body
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, path)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private sealed record Csrf(string Token);

    private static async Task<string> GuestCsrf(HttpClient client) =>
        (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;

    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) =>
        new(
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql(database.ConnectionString)
                .AddInterceptors(interceptor)
                .Options
        );

    private sealed class LockGate(string from, string locking, bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        private bool Matches(DbCommand command) =>
            command.CommandText.Contains(from + " ", StringComparison.Ordinal)
            && command.CommandText.Contains(locking, StringComparison.Ordinal);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken ct = default
        )
        {
            if (Matches(command))
                Attempted.TrySetResult();
            return ValueTask.FromResult(result);
        }

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command,
            CommandExecutedEventData eventData,
            DbDataReader result,
            CancellationToken ct = default
        )
        {
            if (Matches(command))
            {
                Acquired.TrySetResult();
                if (hold)
                    await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
            }
            return result;
        }
    }
}
