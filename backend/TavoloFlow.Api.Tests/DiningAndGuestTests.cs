using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Tables;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class DiningAndGuestTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Dining-test-password-123";
    private static string SessionPath(Guid id) => $"/api/staff/sessions/{id}";
    private static string AccessPath(Guid id) => $"/api/public/sessions/{id}/access";
    private static string CodePath(Guid id) => $"/api/public/sessions/{id}/join-code";
    private static CloseZeroBillInput CloseInput(int version = 1) => new(version, 0, true);

    [Fact]
    public async Task Lifecycle_OpenJoinCloseReopen_PreservesHistoryAndRejectsOldGrant()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        using var guest = host.Browser();
        using var friend = host.Browser();
        var opened = await OpenAsync(staff, table);
        Assert.Equal(1, opened.Session.BillVersion);
        Assert.Equal("8", opened.Session.TableLabel);
        Assert.Matches("^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$", opened.JoinCode);
        await using var db = database.CreateContext();
        var saved = await db.DiningSessions.AsNoTracking().SingleAsync(s => s.Id == opened.Session.SessionId);
        Assert.NotEqual(opened.JoinCode, saved.JoinCodeCiphertext);
        Assert.Equal(opened.JoinCode, host.Services.GetRequiredService<JoinCodes>().Read(saved));
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, table, opened)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(friend, table, opened)).StatusCode);
        Assert.Equal(opened.JoinCode, (await guest.GetFromJsonAsync<JoinCodeResponse>(CodePath(saved.Id)))!.JoinCode);
        var closed = await PostAsync(staff, SessionPath(saved.Id) + "/close-empty", CloseInput());
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);
        var result = (await closed.Content.ReadFromJsonAsync<BillSummaryResponse>())!;
        Assert.Equal("EMPTY", result.CloseReason);
        Assert.Equal("CLOSED", result.Status);
        Assert.Equal(1, result.BillVersion);
        Assert.Equal(0, result.TotalAmountCents);
        foreach (var client in new[] { guest, friend })
        {
            await AssertErrorAsync(await client.GetAsync(AccessPath(saved.Id)), HttpStatusCode.Conflict, "SESSION_CLOSED");
            await AssertErrorAsync(await client.GetAsync(CodePath(saved.Id)), HttpStatusCode.Conflict, "SESSION_CLOSED");
        }
        Assert.Null((await db.DiningSessions.AsNoTracking().SingleAsync(s => s.Id == saved.Id)).JoinCodeCiphertext);
        var next = await OpenAsync(staff, table);
        Assert.NotEqual(saved.Id, next.Session.SessionId);
        Assert.Equal(1, next.Session.BillVersion);
        // Even an identical short code does not revive a cookie bound to the old session.
        var nextEntity = await db.DiningSessions.SingleAsync(s => s.Id == next.Session.SessionId);
        nextEntity.JoinCodeCiphertext = host.Services.GetRequiredService<JoinCodes>().Encrypt(nextEntity, opened.JoinCode!);
        await db.SaveChangesAsync();
        await AssertErrorAsync(await guest.GetAsync(AccessPath(next.Session.SessionId)), HttpStatusCode.Forbidden, "GUEST_SESSION_MISMATCH");
        var repeated = await PostAsync(staff, SessionPath(saved.Id) + "/close-empty", CloseInput());
        Assert.Equal(result, await repeated.Content.ReadFromJsonAsync<BillSummaryResponse>());
        Assert.Equal(DiningSessionStatus.Active, (await db.DiningSessions.AsNoTracking().SingleAsync(s => s.Id == next.Session.SessionId)).Status);
    }

    [Fact]
    public async Task Authorization_AllEndpoints_EnforcesRolesCsrfTenantAndSchemeIsolation()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        using var anonymous = host.Browser();
        var opened = await OpenAsync(staff, table);
        var (otherUser, _) = await SeedAsync();
        using var other = await LoginAsync(host, otherUser);
        var (initialUser, initialTable) = await SeedAsync(mustChange: true);
        using var initial = await LoginAsync(host, initialUser);
        await AssertErrorAsync(await initial.GetAsync("/api/staff/floor"), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        await AssertErrorAsync(await PostAsync(initial, $"/api/staff/tables/{initialTable.Id}/open", new { }), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        await AssertErrorAsync(await anonymous.GetAsync("/api/staff/floor"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        await AssertErrorAsync(await PostAsync(other, $"/api/staff/tables/{table.Id}/open", new { }), HttpStatusCode.NotFound, "TABLE_NOT_FOUND");
        foreach (var suffix in new[] { "", "/join-code" })
            await AssertErrorAsync(await other.GetAsync(SessionPath(opened.Session.SessionId) + suffix), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(other, SessionPath(opened.Session.SessionId) + "/close-empty", CloseInput()), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await AssertErrorAsync(await staff.PostAsJsonAsync(SessionPath(opened.Session.SessionId) + "/close-empty", CloseInput()), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await staff.GetAsync(AccessPath(opened.Session.SessionId)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
        await AssertErrorAsync(await anonymous.PostAsJsonAsync($"/api/public/qr/{table.QrToken}/join", new JoinInput(opened.Session.SessionId, opened.JoinCode)), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await JoinAsync(anonymous, table, opened);
        await AssertErrorAsync(await anonymous.GetAsync("/api/staff/floor"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
    }

    [Fact]
    public async Task Cookies_StoreAndGuestInOneBrowser_KeepIndependentIdentitiesAndCsrf()
    {
        using var host = new AccountTestHost(database);
        var (owner, table) = await SeedAsync(role: RestaurantUserRole.Owner);
        using var browser = await LoginAsync(host, owner);
        var opened = await OpenAsync(browser, table);
        // A store-identity CSRF token cannot authorize a guest-identity write.
        var storeCsrf = await CsrfAsync(browser);
        await AssertErrorAsync(await JoinAsync(browser, table, opened, csrf: storeCsrf), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        var joined = await JoinAsync(browser, table, opened);
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync(AccessPath(opened.Session.SessionId))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(browser, "/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync(AccessPath(opened.Session.SessionId))).StatusCode);
        await AssertErrorAsync(await browser.GetAsync("/api/auth/me"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
    }

    [Fact]
    public async Task Join_WrongCodesBindingsAndReplacedCookie_RejectsWithoutLeakingOrDeletingNewGrant()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        using var guest = host.Browser();
        var first = await OpenAsync(staff, table);
        var wrong = first with { JoinCode = first.JoinCode == "2222" ? "3333" : "2222" };
        await AssertErrorAsync(await JoinAsync(guest, table, wrong), HttpStatusCode.Unauthorized, "JOIN_CODE_INCORRECT");
        await AssertErrorAsync(await JoinAsync(guest, table, first with { JoinCode = "0000" }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await guest.GetAsync(CodePath(first.Session.SessionId)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, table, first with { JoinCode = " " + first.JoinCode!.ToLowerInvariant() + " " })).StatusCode);
        var (otherUser, otherTable) = await SeedAsync();
        using var otherStaff = await LoginAsync(host, otherUser);
        var second = await OpenAsync(otherStaff, otherTable);
        await AssertErrorAsync(await JoinAsync(guest, table, second), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await JoinAsync(guest, otherTable, second);
        var mismatch = await guest.GetAsync(CodePath(first.Session.SessionId));
        await AssertErrorAsync(mismatch, HttpStatusCode.Forbidden, "GUEST_SESSION_MISMATCH");
        Assert.False(mismatch.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(AccessPath(second.Session.SessionId))).StatusCode);
    }

    [Fact]
    public async Task Cookie_ProductionExpiryTamperAndPurpose_RejectsInvalidTickets()
    {
        using var host = new AccountTestHost(database, production: true);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        using var guest = host.Browser();
        var opened = await OpenAsync(staff, table);
        var joined = await JoinAsync(guest, table, opened);
        var header = joined.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("TavoloFlow.Guest="));
        Assert.Contains("httponly", header, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", header, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", header, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("expires=", header, StringComparison.OrdinalIgnoreCase);
        var value = header.Split(';')[0].Split('=', 2)[1];
        var options = host.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>();
        var ticket = options.Get(GuestAuthentication.Scheme).TicketDataFormat.Unprotect(value)!;
        Assert.Equal(TimeSpan.FromHours(12), ticket.Properties.ExpiresUtc - ticket.Properties.IssuedUtc);
        Assert.Null(options.Get("Store").TicketDataFormat.Unprotect(value));
        Assert.DoesNotContain(ticket.Principal.Claims, c => c.Value == opened.JoinCode);
        using var raw = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        raw.DefaultRequestHeaders.Add("Cookie", "TavoloFlow.Guest=corrupt" + value);
        await AssertErrorAsync(await raw.GetAsync(AccessPath(opened.Session.SessionId)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
        host.Clock.Advance(TimeSpan.FromHours(12) + TimeSpan.FromSeconds(1));
        await AssertErrorAsync(await guest.GetAsync(AccessPath(opened.Session.SessionId)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
    }

    [Fact]
    public async Task Entrance_PausedOrderingAllowsJoin_SuspensionAndDisabledTableBlockNewAccess()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync(); // OrderingEnabled remains false.
        using var staff = await LoginAsync(host, user);
        using var guest = host.Browser();
        var opened = await OpenAsync(staff, table);
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, table, opened)).StatusCode);
        await using var db = database.CreateContext();
        await db.RestaurantTables.Where(t => t.Id == table.Id).ExecuteUpdateAsync(u => u.SetProperty(t => t.IsEnabled, false));
        await AssertErrorAsync(await JoinAsync(guest, table, opened), HttpStatusCode.Conflict, "TABLE_DISABLED");
        await AssertErrorAsync(await guest.GetAsync(CodePath(opened.Session.SessionId)), HttpStatusCode.Conflict, "TABLE_DISABLED");
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(AccessPath(opened.Session.SessionId))).StatusCode);
        await db.Restaurants.Where(r => r.Id == user.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended));
        await AssertErrorAsync(await PostAsync(staff, $"/api/staff/tables/{table.Id}/open", new { }), HttpStatusCode.Conflict, "SERVICE_SUSPENDED");
        await AssertErrorAsync(await JoinAsync(guest, table, opened), HttpStatusCode.Conflict, "SERVICE_SUSPENDED");
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync(SessionPath(opened.Session.SessionId) + "/join-code")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, SessionPath(opened.Session.SessionId) + "/close-empty", CloseInput())).StatusCode);
    }

    [Fact]
    public async Task Join_RestaurantWithoutJoinCode_JoinsWithoutCodeAndHidesCodeOnOpen()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync(joinCodeRequired: false);
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        Assert.Null(opened.JoinCode);
        await using var db = database.CreateContext();
        // The session still stores a code, so join codes can be turned back on during service.
        Assert.NotNull((await db.DiningSessions.AsNoTracking().SingleAsync(s => s.Id == opened.Session.SessionId)).JoinCodeCiphertext);
        Assert.False((await staff.GetFromJsonAsync<FloorResponse>("/api/staff/floor"))!.JoinCodeRequired);
        using var guest = host.Browser();
        var bootstrap = (await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/qr/{table.QrToken}/bootstrap"))!;
        Assert.False(bootstrap.Restaurant.JoinCodeRequired);
        Assert.Equal(opened.Session.SessionId, bootstrap.ActiveSessionId);
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, table, opened)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(AccessPath(opened.Session.SessionId))).StatusCode);
        using var friend = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(friend, table, opened with { JoinCode = "2222" })).StatusCode);
        // Entrance and session rules still apply without a code.
        using var stranger = host.Browser();
        await AssertErrorAsync(await JoinAsync(stranger, table, opened with { Session = opened.Session with { SessionId = Guid.NewGuid() } }),
            HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await db.RestaurantTables.Where(t => t.Id == table.Id).ExecuteUpdateAsync(u => u.SetProperty(t => t.IsEnabled, false));
        await AssertErrorAsync(await JoinAsync(stranger, table, opened), HttpStatusCode.Conflict, "TABLE_DISABLED");
    }

    [Fact]
    public async Task Join_JoinCodeReenabled_KeepsExistingGrantAndRequiresCodeForNewGuests()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync(joinCodeRequired: false);
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        using var early = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(early, table, opened)).StatusCode);
        await using var db = database.CreateContext();
        await db.Restaurants.Where(r => r.Id == user.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.JoinCodeRequired, true));
        Assert.Equal(HttpStatusCode.OK, (await early.GetAsync(AccessPath(opened.Session.SessionId))).StatusCode);
        var code = (await staff.GetFromJsonAsync<JoinCodeResponse>(SessionPath(opened.Session.SessionId) + "/join-code"))!.JoinCode;
        using var late = host.Browser();
        await AssertErrorAsync(await JoinAsync(late, table, opened), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await JoinAsync(late, table, opened with { JoinCode = code == "2222" ? "3333" : "2222" }),
            HttpStatusCode.Unauthorized, "JOIN_CODE_INCORRECT");
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(late, table, opened with { JoinCode = code })).StatusCode);
    }

    [Fact]
    public async Task CloseEmpty_InvalidConfirmationOrStaleVersion_DoesNotClose()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        foreach (var input in new object[] { new { }, new CloseZeroBillInput(1, 10, true), new CloseZeroBillInput(1, 0, false), new CloseZeroBillInput(0, 0, true),
            new { expectedBillVersion = 1, confirmedTotalCents = 0, guestsLeftConfirmed = true, restaurantId = user.RestaurantId } })
            await AssertErrorAsync(await PostAsync(staff, SessionPath(opened.Session.SessionId) + "/close-empty", input), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await PostAsync(staff, SessionPath(opened.Session.SessionId) + "/close-empty", CloseInput(2)), HttpStatusCode.Conflict, "BILL_CHANGED");
        Assert.Equal("ACTIVE", (await staff.GetFromJsonAsync<BillSummaryResponse>(SessionPath(opened.Session.SessionId)))!.Status);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CloseEmpty_AnyOrderIncludingCancelled_Rejects(bool cancelled)
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        await using var db = database.CreateContext();
        db.Orders.Add(new Order { RestaurantId = user.RestaurantId, DiningSessionId = opened.Session.SessionId,
            ClientRequestId = Guid.NewGuid(), DefaultLanguageSnapshot = "it", TotalAmountCents = 100,
            Status = cancelled ? OrderStatus.Cancelled : OrderStatus.New,
            CreatedAt = host.Clock.GetUtcNow().UtcDateTime,
            CancelledAt = cancelled ? host.Clock.GetUtcNow().UtcDateTime : null, CancelReason = cancelled ? "test" : null });
        await db.SaveChangesAsync();
        await AssertErrorAsync(await PostAsync(staff, SessionPath(opened.Session.SessionId) + "/close-empty", CloseInput()), HttpStatusCode.Conflict, "SESSION_HAS_ORDERS");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Join_RateLimits_EnforcesIpAndSessionIncludingSuccessfulAttempts(bool ipLimit)
    {
        using var baseHost = new AccountTestHost(database);
        using var host = baseHost.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Configure<GuestRateLimitOptions>(options =>
            {
                options.JoinsPerIpPerMinute = ipLimit ? 2 : 100;
                options.JoinsPerSessionPerFiveMinutes = ipLimit ? 100 : 2;
            })));
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        using var guest = host.CreateClient();
        var opened = await OpenAsync(staff, table);
        Assert.Equal(HttpStatusCode.OK, (await JoinAsync(guest, table, opened)).StatusCode);
        var wrong = opened with { JoinCode = opened.JoinCode == "2222" ? "3333" : "2222" };
        await JoinAsync(guest, table, wrong);
        var denied = await JoinAsync(guest, table, opened);
        await AssertErrorAsync(denied, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.NotNull(denied.Headers.RetryAfter);
    }

    [Fact]
    public async Task Open_ConcurrentRequests_CreatesOnlyOneAndPublicReadsRevealNoCode()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, user);
        var responses = await Task.WhenAll(PostAsync(first, $"/api/staff/tables/{table.Id}/open", new { }),
            PostAsync(second, $"/api/staff/tables/{table.Id}/open", new { }));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        await AssertErrorAsync(Assert.Single(responses, r => r.StatusCode != HttpStatusCode.Created), HttpStatusCode.Conflict, "SESSION_ALREADY_ACTIVE");
        var floor = (await first.GetFromJsonAsync<FloorResponse>("/api/staff/floor"))!;
        Assert.NotNull(Assert.Single(floor.Tables).Session);
        using var anonymous = host.Browser();
        var bootstrap = await anonymous.GetAsync($"/api/public/qr/{table.QrToken}/bootstrap");
        var body = await bootstrap.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"joinCode\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", body, StringComparison.OrdinalIgnoreCase);
        Assert.False(bootstrap.Headers.Contains("Set-Cookie"));
        Assert.Contains("no-store", bootstrap.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task CloseEmpty_FailureAfterUpdate_RollsBackLifecycleAndCiphertext()
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(new FailCloseInterceptor()).Options);
        var service = new BillingService(db, host.Clock);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CloseEmptyAsync(user.RestaurantId, opened.Session.SessionId, CloseInput(), default));
        await using var check = database.CreateContext();
        var saved = await check.DiningSessions.SingleAsync(s => s.Id == opened.Session.SessionId);
        Assert.Equal(DiningSessionStatus.Active, saved.Status);
        Assert.NotNull(saved.JoinCodeCiphertext);
        Assert.Null(saved.ClosedAt);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false)]
    public async Task Open_CompetesWithTableMaintenance_RespectsRowLock(bool openFirst, bool delete)
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        var gate = new ReaderGate("restaurant_tables", "FOR UPDATE", hold: true);
        var waiting = new ReaderGate("restaurant_tables", "FOR UPDATE", hold: false);
        await using var firstDb = Intercepted(gate);
        await using var secondDb = Intercepted(waiting);
        var openDb = openFirst ? firstDb : secondDb;
        var maintenanceDb = openFirst ? secondDb : firstDb;
        var dining = new DiningService(openDb, host.Services.GetRequiredService<JoinCodes>(), host.Clock);
        async Task<object> Open() => await dining.OpenAsync(user.RestaurantId, table.Id, default);
        async Task<object> Maintain()
        {
            var deletion = new CatalogDeletionService(maintenanceDb);
            if (delete) return await deletion.DeleteRestaurantTableAsync(user.RestaurantId, table.Id, default);
            return await new TableService(maintenanceDb, deletion).SetEnabledAsync(user.RestaurantId, table.Id, false, default);
        }
        var first = openFirst ? Open() : Maintain();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = openFirst ? Maintain() : Open();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(second.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        await first;
        if (openFirst)
        {
            var result = await second!;
            if (delete) Assert.Equal(CatalogDeletionResult.TableHasActiveSession, result);
            else Assert.False(((TableResponse)result).IsEnabled);
            await using var check = database.CreateContext();
            Assert.Single(await check.DiningSessions.Where(s => s.TableId == table.Id && s.Status == DiningSessionStatus.Active).ToArrayAsync());
        }
        else
        {
            var error = await Assert.ThrowsAsync<ApiException>(async () => await second!);
            Assert.Equal(delete ? "TABLE_NOT_FOUND" : "TABLE_DISABLED", error.Code);
            await using var check = database.CreateContext();
            Assert.False(await check.DiningSessions.AnyAsync(s => s.TableId == table.Id));
        }
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false)]
    public async Task Guest_JoinOrCodeReadCompetesWithClose_UsesCurrentLockedSession(bool closeFirst, bool join)
    {
        using var host = new AccountTestHost(database);
        var (user, table) = await SeedAsync();
        using var staff = await LoginAsync(host, user);
        var opened = await OpenAsync(staff, table);
        var gate = new ReaderGate("dining_sessions", closeFirst ? "FOR UPDATE" : "FOR SHARE", hold: true);
        var waiting = new ReaderGate("dining_sessions", closeFirst ? "FOR SHARE" : "FOR UPDATE", hold: false);
        await using var firstDb = Intercepted(gate);
        await using var secondDb = Intercepted(waiting);
        var closeDb = closeFirst ? firstDb : secondDb;
        var guestDb = closeFirst ? secondDb : firstDb;
        var codes = host.Services.GetRequiredService<JoinCodes>();
        async Task<object> Close() => await new BillingService(closeDb, host.Clock)
            .CloseEmptyAsync(user.RestaurantId, opened.Session.SessionId, CloseInput(), default);
        async Task<object> Guest()
        {
            var service = new GuestService(guestDb, codes);
            return join ? await service.JoinAsync(table.QrToken, new(opened.Session.SessionId, opened.JoinCode), default)
                : await service.ReadCodeAsync(new(user.RestaurantId, table.Id, opened.Session.SessionId), opened.Session.SessionId, default);
        }
        var first = closeFirst ? Close() : Guest();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = closeFirst ? Guest() : Close();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(second.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        await first;
        if (closeFirst)
            Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(async () => await second!)).Code);
        else await second!;
        await using var check = database.CreateContext();
        var serviceAfterClose = new GuestService(check, codes);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => serviceAfterClose.AccessAsync(
            new(user.RestaurantId, table.Id, opened.Session.SessionId), opened.Session.SessionId, default))).Code);
    }

    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);

    private sealed class ReaderGate(string table, string locking, bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private bool Matches(DbCommand command) => command.CommandText.Contains("FROM " + table, StringComparison.Ordinal)
            && command.CommandText.Contains(locking, StringComparison.Ordinal);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            if (Matches(command)) Attempted.TrySetResult();
            return ValueTask.FromResult(result);
        }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            DbDataReader result, CancellationToken ct = default)
        {
            if (Matches(command))
            {
                Acquired.TrySetResult();
                if (hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
            }
            return result;
        }
    }

    private async Task<(RestaurantUser, RestaurantTable)> SeedAsync(bool mustChange = false, RestaurantUserRole role = RestaurantUserRole.Staff,
        bool joinCodeRequired = true)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Dining test", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active,
            JoinCodeRequired = joinCodeRequired };
        var user = new RestaurantUser { Restaurant = restaurant, Username = "dining." + Guid.NewGuid().ToString("N"),
            PasswordHash = "", Role = role, MustChangePassword = mustChange };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "8", QrToken = Guid.NewGuid().ToString("N") };
        db.RestaurantUsers.Add(user);
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();
        return (user, table);
    }

    private static async Task<HttpClient> LoginAsync(WebApplicationFactory<Program> host, RestaurantUser user)
    {
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode);
        return client;
    }

    private static async Task<OpenSessionResponse> OpenAsync(HttpClient staff, RestaurantTable table)
    {
        var response = await PostAsync(staff, $"/api/staff/tables/{table.Id}/open", new { });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OpenSessionResponse>())!;
    }

    private static async Task<HttpResponseMessage> JoinAsync(HttpClient client, RestaurantTable table, OpenSessionResponse opened, string? csrf = null)
    {
        csrf ??= (await client.GetFromJsonAsync<CsrfToken>("/api/public/csrf"))!.Token;
        return await PostAsync(client, $"/api/public/qr/{table.QrToken}/join", new JoinInput(opened.Session.SessionId, opened.JoinCode), csrf);
    }
    private sealed record CsrfToken(string Token);
    private sealed class FailCloseInterceptor : DbCommandInterceptor
    {
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken ct = default)
        {
            if (command.CommandText.StartsWith("UPDATE dining_sessions", StringComparison.Ordinal)) throw new InvalidOperationException("Injected failure after close write.");
            return ValueTask.FromResult(result);
        }
    }
}
