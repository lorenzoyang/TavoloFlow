using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Query;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Pickup;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class PickupRequestTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    // Monday 2 November 2026, 11:00 in Rome (UTC+1).
    private static readonly DateTimeOffset Monday = DateTimeOffset.Parse("2026-11-02T10:00:00Z");

    private sealed record Setup(Guid RestaurantId, string Slug, MenuItem Item)
    {
        public string Submit => $"/api/public/r/{Slug}/pickup-requests";
        public PickupRequestInput Input(Guid? id = null) =>
            new(id ?? Guid.NewGuid(), " Marco ", "+39 333 123 4567", [new(Item.Id, 2, 700, " 少辣 ")]);
    }

    [Fact]
    public async Task Submit_OpenRestaurant_StoresSnapshotAndRepeatsReturnTheOriginal()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        var input = s.Input();
        var created = await SubmitAsync(guest, s, input);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var first = (await created.Content.ReadFromJsonAsync<PickupSubmissionResponse>())!;
        Assert.Equal((1, Monday.UtcDateTime.AddMinutes(10)), (first.PickupNumber, first.ExpiresAt));
        Assert.Equal(43, first.StatusToken.Length);

        // A repeat skips every gate and returns the stored request, even with other contents.
        await SetAsync(s, r => r.SetProperty(x => x.PickupPaused, true));
        var repeat = await SubmitAsync(guest, s, input with { Items = [new(s.Item.Id, 1, 1, null)] });
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(first, await repeat.Content.ReadFromJsonAsync<PickupSubmissionResponse>());
        Assert.Equal(first, await guest.GetFromJsonAsync<PickupSubmissionResponse>(
            $"/api/public/r/{s.Slug}/pickup-requests/by-client-id/{input.ClientRequestId}"));
        await AssertErrorAsync(await guest.GetAsync($"/api/public/r/{s.Slug}/pickup-requests/by-client-id/{Guid.NewGuid()}"),
            HttpStatusCode.NotFound, "PICKUP_NOT_FOUND");

        await using var db = database.CreateContext();
        var saved = await db.PickupRequests.Include(r => r.Items).SingleAsync(r => r.RestaurantId == s.RestaurantId);
        Assert.Equal(("Marco", "+393331234567", 1400L, "it", new DateOnly(2026, 11, 2)),
            (saved.CustomerName, saved.CustomerPhone, saved.TotalAmountCents, saved.DefaultLanguageSnapshot, saved.BusinessDate));
        var line = Assert.Single(saved.Items);
        Assert.Equal(("炒饭", 700L, 2, "少辣", s.Item.Id), (line.NameZhSnapshot, line.UnitPriceCents, line.Quantity, line.Remark, line.MenuItemId));
        Assert.Null(saved.SessionId);
        // A submission never creates a session, an order or an order item.
        Assert.False(await db.DiningSessions.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.Orders.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.Equal(1, await db.PickupCounters.Where(c => c.RestaurantId == s.RestaurantId).Select(c => c.LastNumber).SingleAsync());
    }

    [Fact]
    public async Task Submit_GatesAndInvalidInput_RejectAndSaveNothing()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        foreach (var invalid in new[]
        {
            s.Input() with { CustomerName = "  " }, s.Input() with { CustomerName = new string('名', 21) },
            s.Input() with { CustomerName = "Mar\nco" }, s.Input() with { CustomerPhone = "12345" },
            s.Input() with { Items = [] }, s.Input() with { ClientRequestId = Guid.Empty }
        })
            await AssertErrorAsync(await SubmitAsync(guest, s, invalid), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        // The anonymous write still needs the /api/public CSRF token.
        await AssertErrorAsync(await guest.PostAsJsonAsync(s.Submit, s.Input()), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await SubmitAsync(guest, s with { Slug = "no-such-menu" }, s.Input()), HttpStatusCode.NotFound, "MENU_LINK_NOT_FOUND");

        await SetAsync(s, r => r.SetProperty(x => x.PickupPaused, true));
        await AssertErrorAsync(await SubmitAsync(guest, s, s.Input()), HttpStatusCode.Conflict, "PICKUP_PAUSED");
        await SetAsync(s, r => r.SetProperty(x => x.PickupPaused, false).SetProperty(x => x.PickupEnabled, false));
        await AssertErrorAsync(await SubmitAsync(guest, s, s.Input()), HttpStatusCode.Conflict, "PICKUP_NOT_OFFERED");
        await SetAsync(s, r => r.SetProperty(x => x.PickupEnabled, true).SetProperty(x => x.ServiceStatus, RestaurantServiceStatus.Suspended));
        await AssertErrorAsync(await SubmitAsync(guest, s, s.Input()), HttpStatusCode.Conflict, "SERVICE_SUSPENDED");
        await SetAsync(s, r => r.SetProperty(x => x.ServiceStatus, RestaurantServiceStatus.Active));
        await using (var db = database.CreateContext())
            await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.PriceCents, 900));
        var changed = await SubmitAsync(guest, s, s.Input());
        await AssertErrorAsync(changed, HttpStatusCode.Conflict, "MENU_CHANGED");
        Assert.Contains("PRICE_CHANGED", await changed.Content.ReadAsStringAsync());

        await using var read = database.CreateContext();
        Assert.False(await read.PickupRequests.AnyAsync(r => r.RestaurantId == s.RestaurantId));
        // Rejected submissions roll the counter back too, so no pickup number is used up.
        Assert.False(await read.PickupCounters.AnyAsync(c => c.RestaurantId == s.RestaurantId));
    }

    [Fact]
    public async Task Submit_OpeningHours_BoundariesAndNextOpeningAcrossDst()
    {
        using var host = Host();
        var s = await SeedAsync(always: false);
        await using (var db = database.CreateContext())
        {
            db.PickupHours.AddRange(
                new PickupHour { RestaurantId = s.RestaurantId, Weekday = 1, Slot = 1, OpensMinute = 660, ClosesMinute = 870 },
                new PickupHour { RestaurantId = s.RestaurantId, Weekday = 7, Slot = 1, OpensMinute = 150, ClosesMinute = 600 });
            await db.SaveChangesAsync();
        }
        using var guest = host.Browser();
        host.Clock.Set(Monday.AddSeconds(-1)); // 10:59:59 local
        var early = await SubmitAsync(guest, s, s.Input());
        await AssertErrorAsync(early, HttpStatusCode.Conflict, "PICKUP_CLOSED");
        Assert.Equal(Monday.UtcDateTime, JsonDocument.Parse(await early.Content.ReadAsStringAsync()).RootElement.GetProperty("nextOpensAt").GetDateTime());
        host.Clock.Set(Monday);
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input())).StatusCode);
        host.Clock.Set(Monday.AddMinutes(209).AddSeconds(59)); // 14:29:59
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input())).StatusCode);
        host.Clock.Set(Monday.AddMinutes(210)); // 14:30, the last moment is exclusive
        await AssertErrorAsync(await SubmitAsync(guest, s, s.Input()), HttpStatusCode.Conflict, "PICKUP_CLOSED");

        // Saturday 27 March 2027, 23:00: Sunday's 02:30 opening falls into the skipped hour and moves to 03:00.
        host.Clock.Set(DateTimeOffset.Parse("2027-03-27T22:00:00Z"));
        var menu = (await guest.GetFromJsonAsync<OnlineMenuResponse>($"/api/public/r/{s.Slug}/bootstrap"))!;
        Assert.Equal(new PickupAvailabilityResponse("CLOSED_HOURS", DateTime.Parse("2027-03-28T01:00:00Z").ToUniversalTime()), menu.Pickup);
        host.Clock.Set(DateTimeOffset.Parse("2027-03-28T01:00:00Z"));
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input())).StatusCode);
    }

    [Fact]
    public async Task Submit_ConcurrentSameRequest_PersistsOneAndKeepsTheNumber()
    {
        using var host = Host();
        var s = await SeedAsync();
        var input = s.Input();
        var gate = new CounterGate(true);
        var secondGate = new CounterGate(false);
        await using var first = Intercepted(gate);
        await using var second = Intercepted(secondGate);
        var firstTask = new PickupOrderService(first, host.Clock).SubmitAsync(s.Slug, input, default);
        Task<PickupSubmission> secondTask;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            secondTask = new PickupOrderService(second, host.Clock).SubmitAsync(s.Slug, input, default);
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            // The second waits on the day's counter row until the first commits.
            await Task.Delay(200);
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        var (a, b) = (await firstTask, await secondTask);
        Assert.True(a.Created);
        Assert.False(b.Created);
        Assert.Equal(a.Response, b.Response);
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.PickupRequests.CountAsync(r => r.RestaurantId == s.RestaurantId));
        Assert.Equal(1, await db.PickupCounters.Where(c => c.RestaurantId == s.RestaurantId).Select(c => c.LastNumber).SingleAsync());

        // Different requests line up on the same row and get consecutive numbers.
        using var guest = host.Browser();
        var csrf = await GuestCsrfAsync(guest);
        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => SubmitAsync(guest, s, s.Input(), csrf)));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        var numbers = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<PickupSubmissionResponse>())!.PickupNumber));
        Assert.Equal(Enumerable.Range(2, 8), numbers.Order());
    }

    [Fact]
    public async Task Submit_NumbersRestartEachLocalBusinessDay()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        host.Clock.Set(DateTimeOffset.Parse("2026-11-02T22:58:00Z")); // 23:58 local Monday
        Assert.Equal(1, await NumberAsync(guest, s));
        Assert.Equal(2, await NumberAsync(guest, s));
        host.Clock.Advance(TimeSpan.FromMinutes(2)); // 00:00 local Tuesday, still 23:00 UTC
        Assert.Equal(1, await NumberAsync(guest, s));
        await using var db = database.CreateContext();
        Assert.Equal(new[] { new DateOnly(2026, 11, 2), new DateOnly(2026, 11, 3) },
            await db.PickupCounters.Where(c => c.RestaurantId == s.RestaurantId).OrderBy(c => c.BusinessDate).Select(c => c.BusinessDate).ToArrayAsync());
    }

    [Fact]
    public async Task Submit_PendingLimit_CountsOnlyRequestsStillWaiting()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        var csrf = await GuestCsrfAsync(guest);
        for (var i = 0; i < PickupState.PendingLimit; i++)
            Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input(), csrf)).StatusCode);
        await AssertErrorAsync(await SubmitAsync(guest, s, s.Input(), csrf), HttpStatusCode.Conflict, "PICKUP_BUSY");

        // Twenty requests nobody handled expire without a write, and must not block the next guest.
        host.Clock.Advance(PickupState.Lifetime);
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input(), csrf)).StatusCode);
    }

    [Fact]
    public async Task Submit_TooManyFromOneAddress_IsRateLimited()
    {
        using var host = new AccountTestHost(database, lowLimits: true);
        host.Clock.Set(Monday);
        var s = await SeedAsync();
        using var guest = host.Browser();
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input())).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(guest, s, s.Input())).StatusCode);
        var limited = await SubmitAsync(guest, s, s.Input());
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.True(limited.Headers.RetryAfter is not null);
    }

    [Fact]
    public async Task Menu_EveryStatus_ShowsMenuAndExposesOnlyPublicFields()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        var text = await guest.GetStringAsync($"/api/public/r/{s.Slug}/bootstrap");
        var menu = JsonSerializer.Deserialize<OnlineMenuResponse>(text, JsonSerializerOptions.Web)!;
        Assert.Equal(("OPEN", "0612345678", "TERRACOTTA"), (menu.Pickup.Status, menu.Restaurant.Phone, menu.Restaurant.Theme));
        Assert.Single(menu.Menu.Items);
        foreach (var secret in new[] { "qrToken", "joinCode", "password", "ownerContact", "annualFee" }) Assert.DoesNotContain(secret, text);
        foreach (var (change, status) in new (Action<UpdateSettersBuilder<Restaurant>>, string)[]
        {
            (r => r.SetProperty(x => x.PickupPaused, true), "PAUSED"),
            (r => r.SetProperty(x => x.PickupEnabled, false), "NOT_OFFERED"),
            (r => r.SetProperty(x => x.ServiceStatus, RestaurantServiceStatus.Suspended), "SUSPENDED")
        })
        {
            await SetAsync(s, change);
            var next = (await guest.GetFromJsonAsync<OnlineMenuResponse>($"/api/public/r/{s.Slug}/bootstrap"))!;
            Assert.Equal(status, next.Pickup.Status);
            Assert.Single(next.Menu.Items);
        }
        await AssertErrorAsync(await guest.GetAsync("/api/public/r/missing-menu/bootstrap"), HttpStatusCode.NotFound, "MENU_LINK_NOT_FOUND");
        await AssertErrorAsync(await guest.GetAsync("/api/public/r/BAD_slug/bootstrap"), HttpStatusCode.NotFound, "MENU_LINK_NOT_FOUND");
    }

    [Fact]
    public async Task Status_PendingThenExpired_HidesPrivateFieldsAndDisappearsAfterADay()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var guest = host.Browser();
        var created = (await (await SubmitAsync(guest, s, s.Input())).Content.ReadFromJsonAsync<PickupSubmissionResponse>())!;
        var path = $"/api/public/pickup-requests/{created.StatusToken}";
        var text = await guest.GetStringAsync(path);
        var status = JsonSerializer.Deserialize<PickupStatusResponse>(text, JsonSerializerOptions.Web)!;
        Assert.Equal(("PENDING", 1, "Marco", 1400L, "0612345678"),
            (status.Status, status.PickupNumber, status.CustomerName, status.PayableAmountCents, status.Restaurant.Phone));
        Assert.Equal(("炒饭", 2, "少辣", false), (status.Items.Single().NameZh, status.Items.Single().Quantity, status.Items.Single().Remark, status.Items.Single().Cancelled));
        foreach (var secret in new[] { "3331234567", "clientRequestId", "sessionId", created.StatusToken, "menuItemId" })
            Assert.DoesNotContain(secret, text);

        host.Clock.Advance(PickupState.Lifetime);
        Assert.Equal("EXPIRED", (await guest.GetFromJsonAsync<PickupStatusResponse>(path))!.Status);
        host.Clock.Advance(PickupState.StatusRetention - TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(path)).StatusCode);
        host.Clock.Advance(TimeSpan.FromSeconds(1));
        await AssertErrorAsync(await guest.GetAsync(path), HttpStatusCode.NotFound, "PICKUP_NOT_FOUND");
        await AssertErrorAsync(await guest.GetAsync("/api/public/pickup-requests/unknown-token"), HttpStatusCode.NotFound, "PICKUP_NOT_FOUND");
        // The row itself stays.
        await using var db = database.CreateContext();
        Assert.True(await db.PickupRequests.AnyAsync(r => r.StatusToken == created.StatusToken));
    }

    private AccountTestHost Host()
    {
        var host = new AccountTestHost(database);
        host.Clock.Set(Monday);
        return host;
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Submit_BrowserCookieCombinations_UsesGuestCsrfScope(bool storeCookie, bool guestCookie)
    {
        using var host = Host();
        var s = await SeedAsync();
        using var browser = host.Browser();
        await using var db = database.CreateContext();
        if (storeCookie)
        {
            const string password = "Review-password-123";
            var user = new RestaurantUser { RestaurantId = s.RestaurantId, Username = "cookie." + Guid.NewGuid().ToString("N"),
                Role = RestaurantUserRole.Owner, MustChangePassword = false, PasswordHash = "" };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, password);
            db.RestaurantUsers.Add(user);
            await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.OK, (await PostAsync(browser, "/api/auth/login", new { user.Username, password })).StatusCode);
        }
        if (guestCookie)
        {
            await db.Restaurants.Where(r => r.Id == s.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.JoinCodeRequired, false));
            var table = new RestaurantTable { RestaurantId = s.RestaurantId, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N") };
            var session = new DiningSession { RestaurantId = s.RestaurantId, Table = table, TableLabelSnapshot = "1",
                JoinCodeCiphertext = "test", OpenedAt = Monday.UtcDateTime };
            db.DiningSessions.Add(session);
            await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.OK, (await PostAsync(browser, $"/api/public/qr/{table.QrToken}/join",
                new { sessionId = session.Id }, await GuestCsrfAsync(browser))).StatusCode);
        }
        await AssertErrorAsync(await SubmitAsync(browser, s, s.Input(), await CsrfAsync(browser)),
            HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(browser, s, s.Input())).StatusCode);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Submit_ConcurrentAcrossMidnight_PreservesIdempotencyAndPendingLimit(bool sameRequest)
    {
        using var host = Host();
        var s = await SeedAsync();
        host.Clock.Set(DateTimeOffset.Parse("2026-11-02T22:59:59Z"));
        if (!sameRequest)
        {
            await using var seed = database.CreateContext();
            for (var i = 0; i < PickupState.PendingLimit - 1; i++)
                await new PickupOrderService(seed, host.Clock).SubmitAsync(s.Slug, s.Input(), default);
        }
        var gate = new CounterGate(true);
        var secondGate = new CounterGate(false);
        await using var first = Intercepted(gate);
        await using var second = Intercepted(secondGate);
        var input = s.Input();
        async Task<(PickupSubmission? Result, string? Error)> Send(ApplicationDbContext db, PickupRequestInput body)
        {
            try { return (await new PickupOrderService(db, host.Clock).SubmitAsync(s.Slug, body, default), null); }
            catch (ApiException e) { return (null, e.Code); }
        }
        var a = Send(first, input);
        Task<(PickupSubmission? Result, string? Error)> b;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            host.Clock.Advance(TimeSpan.FromSeconds(2));
            b = Send(second, sameRequest ? input : s.Input());
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        var results = await Task.WhenAll(a, b);
        await using var read = database.CreateContext();
        if (sameRequest)
        {
            Assert.All(results, x => Assert.Null(x.Error));
            Assert.Single(results, x => x.Result!.Created);
            Assert.Equal(results[0].Result!.Response, results[1].Result!.Response);
            Assert.Equal(1, await read.PickupRequests.CountAsync(r => r.RestaurantId == s.RestaurantId));
        }
        else
        {
            Assert.Single(results, x => x.Result is not null);
            Assert.Equal("PICKUP_BUSY", Assert.Single(results, x => x.Error is not null).Error);
            Assert.Equal(PickupState.PendingLimit, await PickupState.Pending(read.PickupRequests
                .Where(r => r.RestaurantId == s.RestaurantId), host.Clock.GetUtcNow().UtcDateTime).CountAsync());
        }
        Assert.Equal(1, await read.PickupCounters.Where(c => c.RestaurantId == s.RestaurantId &&
            c.BusinessDate == new DateOnly(2026, 11, 3)).Select(c => c.LastNumber).SingleAsync());
    }

    [Fact]
    public async Task Submit_RepeatNextDay_RollsBackTheNewDaysNumber()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var browser = host.Browser();
        var input = s.Input();
        var original = await (await SubmitAsync(browser, s, input)).Content.ReadFromJsonAsync<PickupSubmissionResponse>();
        host.Clock.Advance(TimeSpan.FromDays(1));
        var repeated = await SubmitAsync(browser, s, input);
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(original, await repeated.Content.ReadFromJsonAsync<PickupSubmissionResponse>());
        Assert.Equal(1, await NumberAsync(browser, s));
    }

    [Fact]
    public async Task Submit_DifferentRestaurants_DoNotShareAnAdmissionLock()
    {
        using var host = Host();
        var a = await SeedAsync();
        var b = await SeedAsync();
        var gate = new CounterGate(true);
        await using var first = Intercepted(gate);
        await using var second = database.CreateContext();
        var blocked = new PickupOrderService(first, host.Clock).SubmitAsync(a.Slug, a.Input(), default);
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.True((await new PickupOrderService(second, host.Clock).SubmitAsync(b.Slug, b.Input(), default)
                .WaitAsync(TimeSpan.FromSeconds(5))).Created);
        }
        finally { gate.Release.TrySetResult(); }
        await blocked;
    }

    private async Task<Setup> SeedAsync(bool always = true)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Pickup test", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active,
            PickupEnabled = true, Phone = "0612345678", Slug = "p-" + Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", PriceCents = 700, AllergenReviewed = true };
        db.MenuItems.Add(item);
        if (always)
            db.PickupHours.AddRange(Enumerable.Range(1, 7).Select(d =>
                new PickupHour { Restaurant = restaurant, Weekday = d, Slot = 1, OpensMinute = 0, ClosesMinute = 1440 }));
        await db.SaveChangesAsync();
        return new(restaurant.Id, restaurant.Slug, item);
    }

    private async Task SetAsync(Setup s, Action<UpdateSettersBuilder<Restaurant>> change)
    {
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == s.RestaurantId).ExecuteUpdateAsync(change);
    }

    private static async Task<HttpResponseMessage> SubmitAsync(HttpClient guest, Setup s, PickupRequestInput input, string? csrf = null) =>
        await PostAsync(guest, s.Submit, input, csrf ?? await GuestCsrfAsync(guest));

    private static async Task<int> NumberAsync(HttpClient guest, Setup s)
    {
        var response = await SubmitAsync(guest, s, s.Input());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PickupSubmissionResponse>())!.PickupNumber;
    }

    private static async Task<string> GuestCsrfAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<CsrfToken>("/api/public/csrf"))!.Token;

    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);

    private sealed record CsrfToken(string Token);

    // Holds the first submission right after it locked the day's counter row.
    private sealed class CounterGate(bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private static bool Matches(DbCommand cmd) => cmd.CommandText.Contains("INSERT INTO pickup_counters", StringComparison.Ordinal);
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand cmd, CommandEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        { if (cmd.CommandText.Contains("pg_advisory_xact_lock", StringComparison.Ordinal)) Attempted.TrySetResult(); return ValueTask.FromResult(result); }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand cmd, CommandExecutedEventData data, DbDataReader result, CancellationToken ct = default)
        { if (Matches(cmd)) { Acquired.TrySetResult(); if (hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct); } return result; }
    }
}
