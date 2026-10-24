using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Tables;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class OrderTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Order-test-password-123";
    private sealed record Setup(RestaurantUser User, RestaurantTable Table, MenuItem Item, OpenSessionResponse Opened)
    {
        public GuestIdentity Guest => new(User.RestaurantId, Table.Id, Opened.Session.SessionId);
        public CreateOrderInput Input(int quantity = 2) => new(Opened.Session.SessionId, Guid.NewGuid(),
            [new(Item.Id, quantity, Item.PriceCents, " 少盐 ")], " 一起上菜 ");
    }
    private static string ListPath(Setup s) => $"/api/public/sessions/{s.Guest.SessionId}/orders";
    private static string LookupPath(Setup s, Guid id) => ListPath(s) + "/by-request/" + id;

    [Fact]
    public async Task Create_TwoGuestsAndAddOn_PreservesSnapshotsAndSharesOrders()
    {
        using var host = new AccountTestHost(database);
        var setup = await SeedAsync(host);
        using var guest = await JoinAsync(host, setup);
        using var friend = await JoinAsync(host, setup);
        var input = setup.Input();
        var first = await SubmitAsync(guest, input);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var order = (await first.Content.ReadFromJsonAsync<OrderResponse>())!;
        Assert.Equal(1400, order.TotalAmountCents);
        Assert.Equal("NEW", order.Status);
        Assert.Equal("一起上菜", order.OrderNote);
        Assert.Equal("少盐", order.Items.Single().Remark);
        Assert.Equal(["SOY"], order.Items.Single().AllergenCodes);
        Assert.Equal("炒饭", order.Items.Single().NameZh);
        await SubmitAsync(friend, setup.Input(1));
        await SubmitAsync(guest, setup.Input(3));
        var page = (await friend.GetFromJsonAsync<OrderPage>(ListPath(setup)))!;
        Assert.Equal(3, page.Items.Length);
        Assert.Equal(4200, page.TotalAmountCents);
        await using var db = database.CreateContext();
        Assert.Equal(4, (await db.DiningSessions.FindAsync(setup.Guest.SessionId))!.BillVersion);
        await db.MenuItems.Where(i => i.Id == setup.Item.Id).ExecuteUpdateAsync(u => u
            .SetProperty(i => i.PriceCents, 999).SetProperty(i => i.NameZh, "新名字"));
        await new CatalogDeletionService(db).DeleteMenuItemAsync(setup.Guest.RestaurantId, setup.Item.Id, default);
        var recovered = (await guest.GetFromJsonAsync<OrderResponse>(LookupPath(setup, input.ClientRequestId!.Value)))!;
        Assert.Null(recovered.Items.Single().MenuItemId);
        Assert.Equal("炒饭", recovered.Items.Single().NameZh);
        Assert.Equal(700, recovered.Items.Single().UnitPriceCents);
        var json = await friend.GetStringAsync(ListPath(setup));
        Assert.DoesNotContain("clientRequestId", json);
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Create_TenConcurrentRetriesAndChangedPayload_PersistsOnceAndRecoversDespitePauses()
    {
        using var host = new AccountTestHost(database);
        var setup = await SeedAsync(host);
        using var guest = await JoinAsync(host, setup);
        var input = setup.Input();
        var csrf = await GuestCsrf(guest);
        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => SubmitAsync(guest, input, csrf)));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Equal(9, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var ids = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<OrderResponse>())!.Id));
        Assert.Single(ids.Distinct());
        await using var db = database.CreateContext();
        Assert.Equal(2, (await db.DiningSessions.FindAsync(setup.Guest.SessionId))!.BillVersion);
        await db.Restaurants.Where(r => r.Id == setup.Guest.RestaurantId).ExecuteUpdateAsync(u => u
            .SetProperty(r => r.OrderingEnabled, false).SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended));
        await db.RestaurantTables.Where(t => t.Id == setup.Table.Id).ExecuteUpdateAsync(u => u.SetProperty(t => t.IsEnabled, false));
        await db.MenuItems.Where(i => i.Id == setup.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.IsAvailable, false));
        var retry = await SubmitAsync(guest, input with { Items = null, OrderNote = new string('x', 501) });
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(ids[0], (await retry.Content.ReadFromJsonAsync<OrderResponse>())!.Id);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(ListPath(setup))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(LookupPath(setup, input.ClientRequestId!.Value))).StatusCode);
    }

    [Fact]
    public async Task Create_DifferentConcurrentIntents_PersistsEveryOrderAndVersion()
    {
        using var host = new AccountTestHost(database);
        var setup = await SeedAsync(host);
        await using var a = database.CreateContext();
        await using var b = database.CreateContext();
        await using var c = database.CreateContext();
        await Task.WhenAll(new[] { a, b, c }.Select(db => new OrderService(db, host.Clock).CreateAsync(setup.Guest, setup.Input(), default)));
        await using var check = database.CreateContext();
        Assert.Equal(3, await check.Orders.CountAsync(o => o.DiningSessionId == setup.Guest.SessionId));
        Assert.Equal(4, (await check.DiningSessions.FindAsync(setup.Guest.SessionId))!.BillVersion);
    }

    [Theory]
    [InlineData("empty")][InlineData("too-many-lines")][InlineData("null-line")][InlineData("zero")]
    [InlineData("too-many-per-line")][InlineData("too-many-total")][InlineData("note")][InlineData("remark")]
    [InlineData("price")][InlineData("missing-id")]
    public async Task Create_InvalidInput_RejectsWholeOrder(string scenario)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        using var guest = await JoinAsync(host, s);
        var input = s.Input();
        var line = input.Items![0]!;
        input = scenario switch
        {
            "empty" => input with { Items = [] },
            "too-many-lines" => input with { Items = Enumerable.Repeat(line, 31).ToArray() },
            "null-line" => input with { Items = [null] },
            "zero" => input with { Items = [line with { Quantity = 0 }] },
            "too-many-per-line" => input with { Items = [line with { Quantity = 21 }] },
            "too-many-total" => input with { Items = Enumerable.Repeat(line with { Quantity = 20 }, 6).ToArray() },
            "note" => input with { OrderNote = new string('x', 501) },
            "remark" => input with { Items = [line with { Remark = new string('x', 201) }] },
            "price" => input with { Items = [line with { ExpectedUnitPriceCents = 0 }] },
            _ => input with { ClientRequestId = Guid.Empty }
        };
        await AssertErrorAsync(await SubmitAsync(guest, input), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await using var db = database.CreateContext();
        Assert.False(await db.Orders.AnyAsync(o => o.DiningSessionId == s.Guest.SessionId));
        Assert.Equal(1, (await db.DiningSessions.FindAsync(s.Guest.SessionId))!.BillVersion);
    }

    [Theory]
    [InlineData("price")][InlineData("sold-out")][InlineData("unreviewed")][InlineData("missing")][InlineData("foreign")]
    public async Task Create_ChangedMenu_ReportsConflictWithoutPartialOrder(string scenario)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        using var guest = await JoinAsync(host, s);
        await using var db = database.CreateContext();
        var input = s.Input();
        if (scenario == "price") await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.PriceCents, 900));
        if (scenario == "sold-out") await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.IsAvailable, false));
        if (scenario == "unreviewed") await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.AllergenReviewed, false));
        if (scenario == "missing") await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteDeleteAsync();
        if (scenario == "foreign")
        {
            var other = await SeedAsync(host);
            input = input with { Items = [input.Items![0], new(other.Item.Id, 1, 700, null)] };
        }
        var response = await SubmitAsync(guest, input);
        await AssertErrorAsync(response, HttpStatusCode.Conflict, "MENU_CHANGED");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var change = body.RootElement.GetProperty("changes").EnumerateArray().First();
        Assert.True(change.TryGetProperty("menuItemId", out _));
        Assert.True(change.TryGetProperty("reason", out _));
        Assert.False(await db.Orders.AnyAsync(o => o.DiningSessionId == s.Guest.SessionId));
        Assert.Equal(1, (await db.DiningSessions.FindAsync(s.Guest.SessionId))!.BillVersion);
    }

    [Fact]
    public async Task Amount_SafeIntegerBoundary_RejectsLineOrderAndAccumulatedBillOverflow()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        await using var db = database.CreateContext();
        await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.PriceCents, InputRules.MaxSafeCents));
        var input = s.Input(1) with { Items = [new(s.Item.Id, 2, InputRules.MaxSafeCents, null)] };
        var service = new OrderService(db, host.Clock);
        Assert.Equal("VALIDATION_FAILED", (await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(s.Guest, input, default))).Code);
        input = input with { Items = [new(s.Item.Id, 1, InputRules.MaxSafeCents, null), new(s.Item.Id, 1, InputRules.MaxSafeCents, "other")] };
        Assert.Equal("VALIDATION_FAILED", (await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(s.Guest, input, default))).Code);
        await service.CreateAsync(s.Guest, input with { Items = [input.Items[0]] }, default);
        Assert.Equal("BILL_LIMIT_REACHED", (await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(s.Guest,
            input with { ClientRequestId = Guid.NewGuid(), Items = [input.Items[0]] }, default))).Code);
    }

    [Fact]
    public async Task List_TiedTimestampsAndCursor_ReturnsStablePagesAndNoRequestSecrets()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        using var guest = await JoinAsync(host, s);
        for (var i = 0; i < 3; i++) await SubmitAsync(guest, s.Input(1));
        var first = (await guest.GetFromJsonAsync<OrderPage>(ListPath(s) + "?limit=2"))!;
        Assert.Equal(2, first.Items.Length);
        var second = (await guest.GetFromJsonAsync<OrderPage>(ListPath(s) + "?limit=2&cursor=" + first.NextCursor))!;
        Assert.Single(second.Items);
        Assert.Null(second.NextCursor);
        Assert.Equal(3, first.Items.Concat(second.Items).Select(o => o.Id).Distinct().Count());
        Assert.Equal(2100, second.TotalAmountCents);
        await AssertErrorAsync(await guest.GetAsync(ListPath(s) + "?cursor=bad"), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await guest.GetAsync(ListPath(s) + "?limit=101"), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await guest.GetAsync(LookupPath(s, Guid.NewGuid())), HttpStatusCode.NotFound, "ORDER_NOT_FOUND");
    }

    [Fact]
    public async Task Endpoints_AuthenticationCsrfBindingsAndClosure_RejectUnauthorizedAccess()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        using var anonymous = host.Browser();
        using var staff = await LoginAsync(host, s.User);
        using var guest = await JoinAsync(host, s);
        await AssertErrorAsync(await anonymous.GetAsync(ListPath(s)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
        await AssertErrorAsync(await SubmitAsync(staff, s.Input()), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
        await AssertErrorAsync(await guest.PostAsJsonAsync("/api/public/orders", s.Input()), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await SubmitAsync(guest, s.Input(), await CsrfAsync(staff)), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        var other = await SeedAsync(host);
        await AssertErrorAsync(await SubmitAsync(guest, other.Input()), HttpStatusCode.Forbidden, "GUEST_SESSION_MISMATCH");
        await AssertErrorAsync(await guest.GetAsync(ListPath(other)), HttpStatusCode.Forbidden, "GUEST_SESSION_MISMATCH");
        await AssertErrorAsync(await guest.GetAsync(LookupPath(other, Guid.NewGuid())), HttpStatusCode.Forbidden, "GUEST_SESSION_MISMATCH");
        var input = s.Input();
        await SubmitAsync(guest, input);
        await using var db = database.CreateContext();
        await CloseForTest(db, s, host.Clock);
        await AssertErrorAsync(await SubmitAsync(guest, input), HttpStatusCode.Conflict, "SESSION_CLOSED");
        await AssertErrorAsync(await guest.GetAsync(ListPath(s)), HttpStatusCode.Conflict, "SESSION_CLOSED");
        await AssertErrorAsync(await guest.GetAsync(LookupPath(s, input.ClientRequestId!.Value)), HttpStatusCode.Conflict, "SESSION_CLOSED");
        host.Clock.Advance(TimeSpan.FromHours(13));
        await AssertErrorAsync(await guest.GetAsync(ListPath(s)), HttpStatusCode.Unauthorized, "GUEST_AUTH_REQUIRED");
    }

    [Theory]
    [InlineData(RestaurantUserRole.Owner)][InlineData(RestaurantUserRole.Staff)]
    public async Task AcceptingOrders_StoreRoles_SetOnlyOwnFlagAndBlockNewOrders(RestaurantUserRole role)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host, role);
        var other = await SeedAsync(host);
        using var staff = await LoginAsync(host, s.User);
        using var guest = await JoinAsync(host, s);
        using var request = new HttpRequestMessage(HttpMethod.Patch, "/api/staff/accepting-orders") { Content = JsonContent.Create(new { enabled = false }) };
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(staff));
        Assert.Equal(HttpStatusCode.OK, (await staff.SendAsync(request)).StatusCode);
        await using var db = database.CreateContext();
        Assert.False((await db.Restaurants.FindAsync(s.Guest.RestaurantId))!.OrderingEnabled);
        Assert.True((await db.Restaurants.FindAsync(other.Guest.RestaurantId))!.OrderingEnabled);
        Assert.Equal(RestaurantServiceStatus.Active, (await db.Restaurants.FindAsync(s.Guest.RestaurantId))!.ServiceStatus);
        await AssertErrorAsync(await SubmitAsync(guest, s.Input()), HttpStatusCode.Conflict, "ORDERING_PAUSED");
        using var invalid = new HttpRequestMessage(HttpMethod.Patch, "/api/staff/accepting-orders") { Content = JsonContent.Create(new { enabled = true, restaurantId = other.Guest.RestaurantId }) };
        invalid.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(staff));
        await AssertErrorAsync(await staff.SendAsync(invalid), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
    }

    [Fact]
    public async Task Create_FailureAfterVersionUpdate_RollsBackOrderLinesAndVersion()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        await using var db = Intercepted(new FailVersion());
        await Assert.ThrowsAsync<InvalidOperationException>(() => new OrderService(db, host.Clock).CreateAsync(s.Guest, s.Input(), default));
        await using var check = database.CreateContext();
        Assert.False(await check.Orders.AnyAsync(o => o.DiningSessionId == s.Guest.SessionId));
        Assert.False(await check.OrderItems.AnyAsync(o => o.RestaurantId == s.Guest.RestaurantId));
        Assert.Equal(1, (await check.DiningSessions.FindAsync(s.Guest.SessionId))!.BillVersion);
    }

    [Theory]
    [InlineData("price", true)][InlineData("price", false)]
    [InlineData("sold-out", true)][InlineData("sold-out", false)]
    [InlineData("delete", true)][InlineData("delete", false)]
    [InlineData("disabled", true)][InlineData("disabled", false)]
    [InlineData("paused", true)][InlineData("paused", false)]
    [InlineData("service", true)][InlineData("service", false)]
    [InlineData("close", true)][InlineData("close", false)]
    public async Task Create_CompetingMutation_RespectsBothLockOrders(string kind, bool orderFirst)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var table = kind == "close" ? "dining_sessions" : kind == "disabled" ? "restaurant_tables" : "restaurants";
        var firstGate = new LockGate(table, true);
        var secondGate = new LockGate(table, false);
        await using var first = Intercepted(firstGate);
        await using var second = Intercepted(secondGate);
        var createDb = orderFirst ? first : second;
        var mutationDb = orderFirst ? second : first;
        async Task Mutate()
        {
            if (kind == "close")
                await new BillingService(mutationDb, host.Clock)
                    .CloseEmptyAsync(s.Guest.RestaurantId, s.Guest.SessionId, new(1, 0, true), default);
            else if (kind == "disabled") await new TableService(mutationDb, new CatalogDeletionService(mutationDb))
                    .SetEnabledAsync(s.Guest.RestaurantId, s.Table.Id, false, default);
            else if (kind == "service") await new RestaurantAdministration(mutationDb, new PasswordHasher<RestaurantUser>(),
                    NullLogger<RestaurantAdministration>.Instance, new SubscriptionService(mutationDb, host.Clock, NullLogger<SubscriptionService>.Instance))
                .SetStatusAsync(s.Guest.RestaurantId, "SUSPENDED", Guid.NewGuid(), default);
            else
            {
                await using var tx = await mutationDb.Database.BeginTransactionAsync();
                await mutationDb.Restaurants.FromSqlInterpolated($"SELECT * FROM restaurants WHERE id = {s.Guest.RestaurantId} FOR UPDATE")
                    .AsNoTracking().SingleAsync();
                if (kind == "price") await mutationDb.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.PriceCents, 900));
                if (kind == "sold-out") await mutationDb.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.IsAvailable, false));
                if (kind == "delete")
                {
                    await mutationDb.OrderItems.Where(i => i.MenuItemId == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.MenuItemId, (Guid?)null));
                    await mutationDb.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteDeleteAsync();
                }
                if (kind == "paused") await mutationDb.Restaurants.Where(r => r.Id == s.Guest.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.OrderingEnabled, false));
                await tx.CommitAsync();
            }
        }
        Task<OrderCreation> Create() => new OrderService(createDb, host.Clock).CreateAsync(s.Guest, s.Input(), default);
        Task<OrderCreation>? creation = orderFirst ? Create() : null;
        Task? mutation = orderFirst ? null : Mutate();
        try
        {
            await firstGate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            if (orderFirst) mutation = Mutate(); else creation = Create();
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { firstGate.Release.TrySetResult(); }
        if (orderFirst)
        {
            Assert.True((await creation!).Created);
            if (kind == "close") Assert.Equal("BILL_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => mutation!)).Code);
            else await mutation!;
        }
        else
        {
            await mutation!;
            var exception = await Record.ExceptionAsync(() => creation!);
            Assert.True(exception is ApiException);
        }
        await using var check = database.CreateContext();
        Assert.Equal(orderFirst ? 1 : 0, await check.Orders.CountAsync(o => o.DiningSessionId == s.Guest.SessionId));
        Assert.Equal(orderFirst ? 2 : 1, (await check.DiningSessions.FindAsync(s.Guest.SessionId))!.BillVersion);
        if (kind == "service")
        {
            var restaurant = (await check.Restaurants.FindAsync(s.Guest.RestaurantId))!;
            Assert.Equal(RestaurantServiceStatus.Suspended, restaurant.ServiceStatus);
            Assert.False(restaurant.OrderingEnabled);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task List_CompetesWithClosure_HoldsSessionLockUntilReadCompletes(bool readFirst)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var firstGate = new LockGate("dining_sessions", true);
        var secondGate = new LockGate("dining_sessions", false);
        await using var readDb = Intercepted(readFirst ? firstGate : secondGate);
        await using var closeDb = Intercepted(readFirst ? secondGate : firstGate);
        Task<OrderPage> Read() => new OrderService(readDb, host.Clock).ListAsync(s.Guest, s.Guest.SessionId, null, 50, default);
        Task<BillSummaryResponse> Close() => new BillingService(closeDb, host.Clock)
            .CloseEmptyAsync(s.Guest.RestaurantId, s.Guest.SessionId, new(1, 0, true), default);
        Task<OrderPage>? reading = readFirst ? Read() : null;
        Task<BillSummaryResponse>? closing = readFirst ? null : Close();
        try
        {
            await firstGate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            if (readFirst) closing = Close(); else reading = Read();
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { firstGate.Release.TrySetResult(); }
        Assert.Equal("CLOSED", (await closing!).Status);
        if (readFirst) Assert.Empty((await reading!).Items);
        else Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => reading!)).Code);
    }

    private async Task<Setup> SeedAsync(AccountTestHost host, RestaurantUserRole role = RestaurantUserRole.Staff)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Order test", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active, OrderingEnabled = true };
        var user = new RestaurantUser { Restaurant = restaurant, Username = "order." + Guid.NewGuid().ToString("N"), PasswordHash = "", Role = role, MustChangePassword = false };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "8", QrToken = Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", NameIt = "Riso", NameEn = "Rice", PriceCents = 700, AllergenReviewed = true, AllergenCodes = ["SOY"] };
        db.RestaurantUsers.Add(user); db.RestaurantTables.Add(table); db.MenuItems.Add(item);
        await db.SaveChangesAsync();
        var opened = await new DiningService(db, host.Services.GetRequiredService<JoinCodes>(), host.Clock).OpenAsync(restaurant.Id, table.Id, default);
        return new(user, table, item, opened);
    }
    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode);
        return client;
    }
    private static async Task<HttpClient> JoinAsync(AccountTestHost host, Setup s)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, $"/api/public/qr/{s.Table.QrToken}/join",
            new JoinInput(s.Guest.SessionId, s.Opened.JoinCode), await GuestCsrf(client))).StatusCode);
        return client;
    }
    private sealed record Csrf(string Token);
    private static async Task<string> GuestCsrf(HttpClient client) => (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;
    private static async Task<HttpResponseMessage> SubmitAsync(HttpClient client, CreateOrderInput input, string? csrf = null) =>
        await PostAsync(client, "/api/public/orders", input, csrf ?? await GuestCsrf(client));
    private static Task<int> CloseForTest(ApplicationDbContext db, Setup s, TimeProvider clock) =>
        db.DiningSessions.Where(x => x.Id == s.Guest.SessionId).ExecuteUpdateAsync(u => u
            .SetProperty(x => x.Status, DiningSessionStatus.Closed).SetProperty(x => x.JoinCodeCiphertext, (string?)null)
            .SetProperty(x => x.ClosedAt, clock.GetUtcNow().UtcDateTime).SetProperty(x => x.CloseReason, SessionCloseReason.Paid)
            .SetProperty(x => x.ClosedTotalCents, 1400L));
    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);
    private sealed class FailVersion : DbCommandInterceptor
    {
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken ct = default)
        {
            if (command.CommandText.StartsWith("UPDATE dining_sessions", StringComparison.Ordinal)) throw new InvalidOperationException("Injected order transaction failure.");
            return ValueTask.FromResult(result);
        }
    }
    private sealed class LockGate(string table, bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private bool Matches(DbCommand cmd) => cmd.CommandText.Contains("FROM " + table, StringComparison.Ordinal) && cmd.CommandText.Contains("FOR ", StringComparison.Ordinal);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand cmd, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            if (Matches(cmd)) Attempted.TrySetResult();
            return ValueTask.FromResult(result);
        }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand cmd, CommandExecutedEventData data, DbDataReader result, CancellationToken ct = default)
        {
            if (Matches(cmd)) { Acquired.TrySetResult(); if (hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct); }
            return result;
        }
    }
}
