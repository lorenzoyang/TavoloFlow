using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class KitchenTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Kitchen-test-password-123";
    private const string List = "/api/staff/orders";
    private static string Path(Guid id) => $"{List}/{id}";
    private sealed record Setup(RestaurantUser Staff, RestaurantUser Owner, RestaurantTable Table,
        MenuItem Item, OpenSessionResponse Opened)
    {
        public Guid RestaurantId => Staff.RestaurantId;
        public GuestIdentity Guest => new(RestaurantId, Table.Id, Opened.Session.Id);
        public CreateOrderInput Input() => new(Guest.SessionId, Guid.NewGuid(), [new(Item.Id, 1, 700, "少盐")], "一起上菜");
    }

    [Fact]
    public async Task List_PaginationAndSnapshots_ReturnsScopedStableQueueAndCounters()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var other = await SeedAsync(host);
        var orders = new List<OrderResponse>();
        for (var i = 0; i < 4; i++) orders.Add(await CreateAsync(host, s));
        await CreateAsync(host, other);
        await using (var db = database.CreateContext())
        {
            await db.MenuItems.Where(x => x.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.NameZh, "改名").SetProperty(x => x.PriceCents, 999));
            await db.RestaurantTables.Where(x => x.Id == s.Table.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.TableLabel, "新桌号"));
            await new CatalogDeletionService(db).DeleteMenuItemAsync(s.RestaurantId, s.Item.Id, default);
        }
        using var staff = await LoginAsync(host, s.Staff);
        var first = (await staff.GetFromJsonAsync<KitchenPage>(List + "?limit=2"))!;
        var second = (await staff.GetFromJsonAsync<KitchenPage>(List + "?limit=2&cursor=" + first.NextCursor))!;
        Assert.Equal(4, first.TotalCount); Assert.Equal(4, first.PendingCount); Assert.Equal(4, first.CreatedOrderCount);
        var rows = first.Items.Concat(second.Items).ToArray();
        Assert.Equal(orders.Select(o => o.Id).Order(), rows.Select(o => o.Id));
        Assert.Null(second.NextCursor);
        Assert.All(rows, order =>
        {
            Assert.Equal("8", order.TableLabel); Assert.Equal("炒饭", order.Items.Single().NameZh);
            Assert.Equal(700, order.Items.Single().UnitPriceCents); Assert.Null(order.Items.Single().MenuItemId);
            Assert.Equal("少盐", order.Items.Single().Remark); Assert.Equal(["SOY"], order.Items.Single().AllergenCodes);
        });
        var json = await staff.GetStringAsync(List);
        foreach (var secret in new[] { "clientRequestId", "joinCode", "passwordHash" }) Assert.DoesNotContain(secret, json);
        foreach (var query in new[] { "?cursor=broken", "?status=bad", "?limit=0", "?limit=101", "?status=READY&cursor=" + first.NextCursor })
            await AssertErrorAsync(await staff.GetAsync(List + query), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        using var foreign = await LoginAsync(host, other.Staff);
        await AssertErrorAsync(await foreign.GetAsync(List + "?cursor=" + first.NextCursor), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
    }

    [Fact]
    public async Task Transitions_RolesAndGuestRecovery_PreserveHistoryAndUpdateOnlyCancellationVersion()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var input = s.Input();
        var a = await CreateAsync(host, s, input);
        var b = await CreateAsync(host, s);
        using var staff = await LoginAsync(host, s.Staff);
        using var owner = await LoginAsync(host, s.Owner);
        var ready = await PostAsync(staff, Path(a.Id) + "/ready", new { });
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var completed = (await ready.Content.ReadFromJsonAsync<KitchenOrderResponse>())!;
        Assert.NotNull(completed.ReadyAt);
        Assert.Equal(3, await VersionAsync(s));
        await AssertErrorAsync(await PostAsync(staff, Path(a.Id) + "/ready", new { }), HttpStatusCode.Conflict, "ORDER_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Path(a.Id) + "/cancel", new { expectedStatus = "READY", reason = "作废" }), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await PostAsync(owner, Path(a.Id) + "/cancel", new { expectedStatus = "NEW", reason = "旧确认" }), HttpStatusCode.Conflict, "ORDER_CHANGED");
        host.Clock.Advance(TimeSpan.FromSeconds(2));
        var cancellation = await PostAsync(owner, Path(a.Id) + "/cancel", new { expectedStatus = "READY", reason = "  顾客退单  " });
        Assert.Equal(HttpStatusCode.OK, cancellation.StatusCode);
        var cancelled = (await cancellation.Content.ReadFromJsonAsync<KitchenOrderResponse>())!;
        Assert.Equal(completed.ReadyAt, cancelled.ReadyAt); Assert.Equal("顾客退单", cancelled.CancelReason);
        Assert.Equal(700, cancelled.TotalAmountCents); Assert.NotNull(cancelled.CancelledAt);
        await AssertErrorAsync(await PostAsync(owner, Path(a.Id) + "/cancel", new { expectedStatus = "READY", reason = "不能覆盖" }), HttpStatusCode.Conflict, "ORDER_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Path(a.Id) + "/ready", new { }), HttpStatusCode.Conflict, "ORDER_CHANGED");
        Assert.Equal(4, await VersionAsync(s));
        using var guest = host.Browser();
        var token = (await guest.GetFromJsonAsync<Token>("/api/public/csrf"))!.Value;
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(guest, $"/api/public/qr/{s.Table.QrToken}/join",
            new JoinInput(s.Guest.SessionId, s.Opened.JoinCode), token)).StatusCode);
        var page = (await guest.GetFromJsonAsync<OrderPage>($"/api/public/sessions/{s.Guest.SessionId}/orders"))!;
        Assert.Equal(700, page.TotalAmountCents);
        Assert.Equal("CANCELLED", page.Items.Single(o => o.Id == a.Id).Status);
        await using (var db = database.CreateContext())
        {
            var recovered = await new OrderService(db, host.Clock).CreateAsync(s.Guest, input, default);
            Assert.False(recovered.Created); Assert.Equal("CANCELLED", recovered.Order.Status);
        }
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, Path(b.Id) + "/cancel", new { expectedStatus = "NEW", reason = "重复点单" })).StatusCode);
        Assert.Equal(5, await VersionAsync(s));
        await AssertErrorAsync(await PostAsync(staff, $"/api/staff/sessions/{s.Guest.SessionId}/close-empty",
            new CloseEmptyInput(5, 0, true)), HttpStatusCode.Conflict, "SESSION_HAS_ORDERS");
        var queue = (await staff.GetFromJsonAsync<KitchenPage>(List + "?status=CANCELLED"))!;
        Assert.Equal(2, queue.TotalCount); Assert.Equal(0, queue.PendingCount); Assert.Equal(2, queue.CreatedOrderCount);
        Assert.Equal("顾客退单", (await staff.GetFromJsonAsync<KitchenOrderResponse>(Path(a.Id)))!.CancelReason);
    }

    [Fact]
    public async Task Endpoints_AuthCsrfTenantAndFirstPassword_RejectInvalidCallers()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var other = await SeedAsync(host);
        var order = await CreateAsync(host, s);
        using var anonymous = host.Browser(); using var staff = await LoginAsync(host, s.Staff);
        using var foreign = await LoginAsync(host, other.Owner);
        foreach (var url in new[] { List, Path(order.Id) })
            await AssertErrorAsync(await anonymous.GetAsync(url), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        await AssertErrorAsync(await staff.PostAsJsonAsync(Path(order.Id) + "/ready", new { }), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await staff.PostAsJsonAsync(Path(order.Id) + "/cancel", new { expectedStatus = "NEW", reason = "取消" }), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await foreign.GetAsync(Path(order.Id)), HttpStatusCode.NotFound, "ORDER_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, Path(order.Id) + "/ready", new { }), HttpStatusCode.NotFound, "ORDER_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, Path(order.Id) + "/cancel", new { expectedStatus = "NEW", reason = "取消" }), HttpStatusCode.NotFound, "ORDER_NOT_FOUND");
        foreach (var body in new object[] { new { }, new { expectedStatus = "CANCELLED", reason = "取消" },
            new { expectedStatus = "NEW", reason = " \t " }, new { expectedStatus = "NEW", reason = new string('x', 501) },
            new { expectedStatus = "NEW", reason = "取消", restaurantId = s.RestaurantId } })
            await AssertErrorAsync(await PostAsync(staff, Path(order.Id) + "/cancel", body), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await using var db = database.CreateContext();
        await db.RestaurantUsers.Where(u => u.Id == s.Staff.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.MustChangePassword, true));
        await AssertErrorAsync(await staff.GetAsync(List), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        await AssertErrorAsync(await PostAsync(staff, Path(order.Id) + "/ready", new { }), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
    }

    [Fact]
    public async Task List_ProcessedOrderingAndClosedSessions_UsesActionTimeAndKeepsCreationCounter()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var a = await CreateAsync(host, s); var b = await CreateAsync(host, s); var c = await CreateAsync(host, s);
        await using var db = database.CreateContext();
        var service = new KitchenService(db, host.Clock);
        await service.ReadyAsync(s.RestaurantId, b.Id, default);
        host.Clock.Advance(TimeSpan.FromSeconds(1));
        await service.ReadyAsync(s.RestaurantId, a.Id, default);
        await service.ReadyAsync(s.RestaurantId, c.Id, default);
        var first = await service.ListAsync(s.RestaurantId, "READY", null, 1, default);
        var rest = await service.ListAsync(s.RestaurantId, "READY", first.NextCursor, 100, default);
        Assert.Equal(new[] { c.Id, a.Id, b.Id }, first.Items.Concat(rest.Items).Select(x => x.Id));
        await CloseForTest(db, s, host.Clock);
        var empty = await service.ListAsync(s.RestaurantId, "READY", null, 50, default);
        Assert.Empty(empty.Items); Assert.Equal(0, empty.TotalCount); Assert.Equal(3, empty.CreatedOrderCount);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => service.ReadAsync(s.RestaurantId, a.Id, default))).Code);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => service.ReadyAsync(s.RestaurantId, b.Id, default))).Code);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => service.CancelAsync(s.RestaurantId, a.Id, RestaurantUserRole.Owner, new("READY", "取消"), default))).Code);
    }

    [Fact]
    public async Task Changes_PausedEntranceAndVersionLimit_AllowExistingWorkButPreventOverflow()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var a = await CreateAsync(host, s); var b = await CreateAsync(host, s);
        await using var db = database.CreateContext();
        await db.Restaurants.Where(x => x.Id == s.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(x => x.ServiceStatus, RestaurantServiceStatus.Suspended).SetProperty(x => x.OrderingEnabled, false));
        await db.RestaurantTables.Where(x => x.Id == s.Table.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.IsEnabled, false));
        var service = new KitchenService(db, host.Clock);
        Assert.Equal(2, (await service.ListAsync(s.RestaurantId, "NEW", null, 50, default)).TotalCount);
        await service.ReadyAsync(s.RestaurantId, a.Id, default);
        await service.CancelAsync(s.RestaurantId, a.Id, RestaurantUserRole.Owner, new("READY", "取消"), default);
        await db.DiningSessions.Where(x => x.Id == s.Guest.SessionId).ExecuteUpdateAsync(u => u.SetProperty(x => x.BillVersion, int.MaxValue));
        Assert.Equal("BILL_LIMIT_REACHED", (await Assert.ThrowsAsync<OrderException>(() => service.CancelAsync(s.RestaurantId, b.Id, RestaurantUserRole.Staff, new("NEW", "取消"), default))).Code);
        Assert.Equal("NEW", (await service.ReadAsync(s.RestaurantId, b.Id, default)).Status);
        await service.ReadyAsync(s.RestaurantId, b.Id, default);
        Assert.Equal(int.MaxValue, await VersionAsync(s));
    }

    [Theory]
    [InlineData(false, false)][InlineData(true, true)][InlineData(false, true)]
    public async Task Changes_TwoConcurrentDevices_OnlyOneTransitionAndAtMostOneVersionIncrement(bool cancelA, bool cancelB)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var order = await CreateAsync(host, s);
        async Task<Exception?> Attempt(bool cancel)
        {
            await using var db = database.CreateContext();
            var service = new KitchenService(db, host.Clock);
            return await Record.ExceptionAsync(async () =>
            {
                if (cancel) await service.CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Owner, new("NEW", "首个原因"), default);
                else await service.ReadyAsync(s.RestaurantId, order.Id, default);
            });
        }
        var errors = await Task.WhenAll(Attempt(cancelA), Attempt(cancelB));
        Assert.Single(errors, e => e is null);
        Assert.Equal("ORDER_CHANGED", Assert.IsType<OrderException>(errors.Single(e => e is not null)).Code);
        await using var check = database.CreateContext();
        var saved = await check.Orders.SingleAsync(o => o.Id == order.Id);
        Assert.Equal(saved.Status == OrderStatus.Cancelled ? 3 : 2, await VersionAsync(s));
    }

    [Fact]
    public async Task Cancel_ConcurrentNewSubmissionAndOtherCancellation_IncrementsEveryActualChange()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var a = await CreateAsync(host, s); var b = await CreateAsync(host, s);
        async Task Cancel(Guid id)
        {
            await using var db = database.CreateContext();
            await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, id, RestaurantUserRole.Staff, new("NEW", "取消"), default);
        }
        await Task.WhenAll(Cancel(a.Id), Cancel(b.Id), CreateAsync(host, s));
        Assert.Equal(6, await VersionAsync(s));
        await using var check = database.CreateContext();
        Assert.Equal(700, await check.Orders.Where(o => o.DiningSessionId == s.Guest.SessionId && o.Status != OrderStatus.Cancelled).SumAsync(o => o.TotalAmountCents));
    }

    [Fact]
    public async Task Cancel_FailureAfterVersionUpdate_RollsBackOrderMetadataAndVersion()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var order = await CreateAsync(host, s);
        await using var db = Intercepted(new FailVersion());
        await Assert.ThrowsAsync<InvalidOperationException>(() => new KitchenService(db, host.Clock)
            .CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Staff, new("NEW", "取消"), default));
        await using var check = database.CreateContext();
        var saved = await check.Orders.SingleAsync(o => o.Id == order.Id);
        Assert.Equal(OrderStatus.New, saved.Status); Assert.Null(saved.CancelledAt); Assert.Null(saved.CancelReason);
        Assert.Equal(2, await VersionAsync(s));
    }

    [Theory]
    [InlineData(true)][InlineData(false)]
    public async Task Cancel_CompetesWithClosure_RespectsSessionLockInBothOrders(bool cancelFirst)
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var order = await CreateAsync(host, s);
        var gate = new LockGate(true); var secondGate = new LockGate(false);
        await using var first = Intercepted(gate); await using var second = Intercepted(secondGate);
        var cancelDb = cancelFirst ? first : second; var closeDb = cancelFirst ? second : first;
        async Task Close()
        {
            await using var tx = await closeDb.Database.BeginTransactionAsync();
            await DiningLocks.SessionAsync(closeDb, s.RestaurantId, s.Guest.SessionId, true, default);
            await CloseForTest(closeDb, s, host.Clock);
            await tx.CommitAsync();
        }
        Task<KitchenOrderResponse> Cancel() => new KitchenService(cancelDb, host.Clock)
            .CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Staff, new("NEW", "取消"), default);
        Task<KitchenOrderResponse>? cancelling = cancelFirst ? Cancel() : null;
        Task? closing = cancelFirst ? null : Close();
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            if (cancelFirst) closing = Close(); else cancelling = Cancel();
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        await closing!;
        if (cancelFirst) Assert.Equal("CANCELLED", (await cancelling!).Status);
        else Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => cancelling!)).Code);
        Assert.Equal(cancelFirst ? 3 : 2, await VersionAsync(s));
    }

    private async Task<Setup> SeedAsync(AccountTestHost host)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Kitchen test", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active, OrderingEnabled = true };
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser { Restaurant = restaurant, Username = "kitchen." + Guid.NewGuid().ToString("N"), PasswordHash = "", Role = role, MustChangePassword = false };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
            return user;
        }
        var staff = User(RestaurantUserRole.Staff); var owner = User(RestaurantUserRole.Owner);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "8", QrToken = Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", NameIt = "Riso", PriceCents = 700, AllergenReviewed = true, AllergenCodes = ["SOY"] };
        db.RestaurantUsers.AddRange(staff, owner); db.RestaurantTables.Add(table); db.MenuItems.Add(item);
        await db.SaveChangesAsync();
        var opened = await new DiningService(db, host.Services.GetRequiredService<JoinCodes>(), host.Clock).OpenAsync(restaurant.Id, table.Id, default);
        return new(staff, owner, table, item, opened);
    }
    private async Task<OrderResponse> CreateAsync(AccountTestHost host, Setup s, CreateOrderInput? input = null)
    {
        await using var db = database.CreateContext();
        return (await new OrderService(db, host.Clock).CreateAsync(s.Guest, input ?? s.Input(), default)).Order;
    }
    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode);
        return client;
    }
    private async Task<int> VersionAsync(Setup s)
    {
        await using var db = database.CreateContext();
        return await db.DiningSessions.Where(x => x.Id == s.Guest.SessionId).Select(x => x.BillVersion).SingleAsync();
    }
    private sealed record Token([property: System.Text.Json.Serialization.JsonPropertyName("token")] string Value);
    private static async Task CloseForTest(ApplicationDbContext db, Setup s, TimeProvider clock)
    {
        var total = await db.Orders.Where(o => o.DiningSessionId == s.Guest.SessionId && o.Status != OrderStatus.Cancelled).SumAsync(o => o.TotalAmountCents);
        await db.DiningSessions.Where(x => x.Id == s.Guest.SessionId).ExecuteUpdateAsync(u => u
            .SetProperty(x => x.Status, DiningSessionStatus.Closed).SetProperty(x => x.JoinCodeCiphertext, (string?)null)
            .SetProperty(x => x.ClosedAt, clock.GetUtcNow().UtcDateTime).SetProperty(x => x.CloseReason, SessionCloseReason.Paid)
            .SetProperty(x => x.ClosedTotalCents, total));
    }
    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);
    private sealed class FailVersion : DbCommandInterceptor
    {
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData data, int result, CancellationToken ct = default)
        {
            if (command.CommandText.StartsWith("UPDATE dining_sessions", StringComparison.Ordinal)) throw new InvalidOperationException("Injected cancellation failure.");
            return ValueTask.FromResult(result);
        }
    }
    private sealed class LockGate(bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private static bool Matches(DbCommand cmd) => cmd.CommandText.Contains("FROM dining_sessions", StringComparison.Ordinal) && cmd.CommandText.Contains("FOR ", StringComparison.Ordinal);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand cmd, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        { if (Matches(cmd)) Attempted.TrySetResult(); return ValueTask.FromResult(result); }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand cmd, CommandExecutedEventData data, DbDataReader result, CancellationToken ct = default)
        { if (Matches(cmd)) { Acquired.TrySetResult(); if (hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct); } return result; }
    }
}
