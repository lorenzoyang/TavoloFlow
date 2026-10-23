using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class BillingTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Billing-test-password-123";
    private sealed record Setup(RestaurantUser Owner, RestaurantUser Staff, RestaurantTable Table, MenuItem Item, OpenSessionResponse Open)
    {
        public Guid RestaurantId => Owner.RestaurantId;
        public Guid Id => Open.Session.Id;
        public GuestIdentity Guest => new(RestaurantId, Table.Id, Id);
        public CreateOrderInput Input() => new(Id, Guid.NewGuid(), [new(Item.Id, 1, 700, "少盐")], "一起上菜");
    }
    private static string Bill(Guid id) => $"/api/staff/sessions/{id}/bill";
    private static string Checkout(Guid id) => $"/api/owner/sessions/{id}/checkout";
    private static string Void(Guid id) => $"/api/staff/sessions/{id}/close-void";

    [Fact]
    public async Task Bill_PaginationAndChanges_ReturnsSnapshotsAndRejectsMixedVersions()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host);
        var a = await Create(host, s); var b = await Create(host, s); var c = await Create(host, s);
        using var staff = await Login(host, s.Staff);
        var first = (await staff.GetFromJsonAsync<BillPage>(Bill(s.Id) + "?limit=2"))!;
        Assert.Equal(2100, first.Summary.TotalAmountCents); Assert.Equal(3, first.Summary.NewOrderCount);
        var second = (await staff.GetFromJsonAsync<BillPage>(Bill(s.Id) + "?limit=2&cursor=" + first.NextCursor))!;
        Assert.Equal(new[] { a.Id, b.Id, c.Id }, first.Orders.Concat(second.Orders).Select(o => o.Id));
        Assert.Null(second.NextCursor);
        await using var db = database.CreateContext();
        await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, a.Id, RestaurantUserRole.Staff, new("NEW", "点错"), default);
        var conflict = await staff.GetAsync(Bill(s.Id) + "?cursor=" + first.NextCursor);
        await AssertErrorAsync(conflict, HttpStatusCode.Conflict, "BILL_CHANGED");
        var json = await conflict.Content.ReadAsStringAsync(); Assert.Contains("currentBill", json); Assert.Contains("1400", json);
        await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.NameZh, "新菜名").SetProperty(i => i.PriceCents, 999));
        await new CatalogDeletionService(db).DeleteMenuItemAsync(s.RestaurantId, s.Item.Id, default);
        var bill = (await staff.GetFromJsonAsync<BillPage>(Bill(s.Id)))!;
        Assert.Equal(1, bill.Summary.CancelledOrderCount); Assert.Equal(1400, bill.Summary.TotalAmountCents);
        Assert.All(bill.Orders, o => { Assert.Equal("炒饭", o.Items.Single().NameZh); Assert.Equal(700, o.TotalAmountCents); Assert.Null(o.Items.Single().MenuItemId); });
        Assert.Equal("点错", bill.Orders[0].CancelReason);
        var floor = (await staff.GetFromJsonAsync<FloorResponse>("/api/staff/floor"))!.Tables.Single().Session!;
        Assert.Equal(1400, floor.TotalAmountCents); Assert.Equal(3, floor.OrderCount); Assert.Equal(2, floor.NewOrderCount);
        foreach (var secret in new[] { "clientRequestId", "joinCode", "passwordHash" }) Assert.DoesNotContain(secret, await staff.GetStringAsync(Bill(s.Id)));
        foreach (var query in new[] { "?limit=0", "?limit=101", "?cursor=bad" })
            await AssertErrorAsync(await staff.GetAsync(Bill(s.Id) + query), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
    }

    [Fact]
    public async Task Checkout_ConfirmationAndRepeatedRequests_ClosesExactlyOnceWithoutChangingVersion()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var a = await Create(host, s); var b = await Create(host, s);
        using var owner = await Login(host, s.Owner);
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(1, 1400)), HttpStatusCode.Conflict, "BILL_CHANGED");
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(3, 1399)), HttpStatusCode.Conflict, "BILL_CHANGED");
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(3, 1400)), HttpStatusCode.Conflict, "ORDERS_PENDING");
        await using var db = database.CreateContext(); var kitchen = new KitchenService(db, host.Clock);
        await kitchen.ReadyAsync(s.RestaurantId, a.Id, default);
        await kitchen.CancelAsync(s.RestaurantId, b.Id, RestaurantUserRole.Staff, new("NEW", "重复"), default);
        await db.Restaurants.Where(r => r.Id == s.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended).SetProperty(r => r.OrderingEnabled, false));
        await db.RestaurantTables.Where(t => t.Id == s.Table.Id).ExecuteUpdateAsync(u => u.SetProperty(t => t.IsEnabled, false));
        var response = await PostAsync(owner, Checkout(s.Id), new CheckoutInput(4, 700));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = (await response.Content.ReadFromJsonAsync<BillSummaryResponse>())!;
        Assert.Equal("PAID", saved.CloseReason); Assert.Equal(4, saved.BillVersion); Assert.Equal(700, saved.TotalAmountCents);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        var repeated = (await (await PostAsync(owner, Checkout(s.Id), new CheckoutInput(4, 700))).Content.ReadFromJsonAsync<BillSummaryResponse>())!;
        Assert.Equal(saved, repeated);
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(4, 800)), HttpStatusCode.Conflict, "SESSION_CLOSED");
        await AssertErrorAsync(await PostAsync(owner, Void(s.Id), new CloseVoidInput(4, 0, true)), HttpStatusCode.Conflict, "SESSION_CLOSED");
        Assert.Null(await db.DiningSessions.Where(x => x.Id == s.Id).Select(x => x.JoinCodeCiphertext).SingleAsync());
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => kitchen.ReadyAsync(s.RestaurantId, a.Id, default))).Code);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<DiningException>(() => kitchen.CancelAsync(s.RestaurantId, a.Id, RestaurantUserRole.Owner, new("READY", "错误"), default))).Code);
        var history = (await owner.GetFromJsonAsync<BillPage>($"/api/owner/history/{s.Id}"))!;
        Assert.Equal(saved, history.Summary); Assert.Equal(2, history.Orders.Length);
        await AssertErrorAsync(await owner.GetAsync(Bill(s.Id)), HttpStatusCode.Conflict, "SESSION_CLOSED");
    }

    [Fact]
    public async Task ZeroClosure_EmptyAndAllCancelled_RequireTheirOwnConditions()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host);
        using var staff = await Login(host, s.Staff); using var owner = await Login(host, s.Owner);
        await AssertErrorAsync(await PostAsync(staff, Void(s.Id), new CloseVoidInput(1, 0, true)), HttpStatusCode.Conflict, "SESSION_NOT_VOIDABLE");
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(1, 0)), HttpStatusCode.Conflict, "SESSION_NOT_PAYABLE");
        var order = await Create(host, s);
        await using var db = database.CreateContext();
        await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Staff, new("NEW", "退单"), default);
        await AssertErrorAsync(await PostAsync(staff, $"/api/staff/sessions/{s.Id}/close-empty", new CloseEmptyInput(3, 0, true)), HttpStatusCode.Conflict, "SESSION_HAS_ORDERS");
        await AssertErrorAsync(await PostAsync(staff, Void(s.Id), new CloseVoidInput(3, 0, false)), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await PostAsync(staff, Void(s.Id), new CloseVoidInput(2, 0, true)), HttpStatusCode.Conflict, "BILL_CHANGED");
        var closed = (await (await PostAsync(staff, Void(s.Id), new CloseVoidInput(3, 0, true))).Content.ReadFromJsonAsync<BillSummaryResponse>())!;
        Assert.Equal("VOIDED", closed.CloseReason); Assert.Equal(3, closed.BillVersion); Assert.Equal(0, closed.TotalAmountCents);
        Assert.Equal(closed, await (await PostAsync(staff, Void(s.Id), new CloseVoidInput(3, 0, true))).Content.ReadFromJsonAsync<BillSummaryResponse>());
        var empty = await Seed(host);
        using var emptyOwner = await Login(host, empty.Owner);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(emptyOwner, $"/api/staff/sessions/{empty.Id}/close-empty", new CloseEmptyInput(1, 0, true))).StatusCode);
        var historical = (await emptyOwner.GetFromJsonAsync<BillPage>($"/api/owner/history/{empty.Id}"))!;
        Assert.Equal("EMPTY", historical.Summary.CloseReason); Assert.Empty(historical.Orders);
    }

    [Fact]
    public async Task Endpoints_IdentityCsrfAndTenant_RejectUnauthorizedAccess()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var other = await Seed(host);
        using var anonymous = host.Browser(); using var staff = await Login(host, s.Staff);
        using var owner = await Login(host, s.Owner); using var foreign = await Login(host, other.Owner);
        foreach (var path in new[] { Bill(s.Id), "/api/owner/history", $"/api/owner/history/{s.Id}" })
            await AssertErrorAsync(await anonymous.GetAsync(path), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        foreach (var path in new[] { "/api/owner/history", $"/api/owner/history/{s.Id}" })
            await AssertErrorAsync(await staff.GetAsync(path), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await PostAsync(staff, Checkout(s.Id), new CheckoutInput(1, 0)), HttpStatusCode.Forbidden, "FORBIDDEN");
        foreach (var path in new[] { Bill(s.Id), $"/api/owner/history/{s.Id}" })
            await AssertErrorAsync(await foreign.GetAsync(path), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, Checkout(s.Id), new CheckoutInput(1, 0)), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, Void(s.Id), new CloseVoidInput(1, 0, true)), HttpStatusCode.NotFound, "SESSION_NOT_FOUND");
        await AssertErrorAsync(await owner.PostAsJsonAsync(Checkout(s.Id), new CheckoutInput(1, 0)), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await staff.PostAsJsonAsync(Void(s.Id), new CloseVoidInput(1, 0, true)), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        foreach (var input in new object[] { new { }, new { expectedBillVersion = 0, confirmedTotalCents = 1 },
            new { expectedBillVersion = 1, confirmedTotalCents = -1 }, new { expectedBillVersion = 1, confirmedTotalCents = 9_007_199_254_740_992L },
            new { expectedBillVersion = 1, confirmedTotalCents = 1, restaurantId = s.RestaurantId } })
            await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), input), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await using var db = database.CreateContext();
        await db.RestaurantUsers.Where(u => u.Id == s.Owner.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.MustChangePassword, true));
        await AssertErrorAsync(await owner.GetAsync("/api/owner/history"), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        await AssertErrorAsync(await PostAsync(owner, Checkout(s.Id), new CheckoutInput(1, 0)), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
    }

    [Fact]
    public async Task Checkout_ClosesGuestAccessAndReopening_NeverRevivesOldAuthorization()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var input = s.Input(); var order = await Create(host, s, input);
        using var guest = host.Browser(); using var owner = await Login(host, s.Owner);
        var token = (await guest.GetFromJsonAsync<Token>("/api/public/csrf"))!.Value;
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(guest, $"/api/public/qr/{s.Table.QrToken}/join", new JoinInput(s.Id, s.Open.JoinCode), token)).StatusCode);
        await using var db = database.CreateContext();
        await new KitchenService(db, host.Clock).ReadyAsync(s.RestaurantId, order.Id, default);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(owner, Checkout(s.Id), new CheckoutInput(2, 700))).StatusCode);
        var reopened = await new DiningService(db, host.Services.GetRequiredService<JoinCodes>(), host.Clock).OpenAsync(s.RestaurantId, s.Table.Id, default);
        Assert.NotEqual(s.Id, reopened.Session.Id); Assert.Equal(1, reopened.Session.BillVersion);
        foreach (var suffix in new[] { "access", "orders", "join-code", $"orders/by-request/{input.ClientRequestId}" })
            Assert.False((await guest.GetAsync($"/api/public/sessions/{s.Id}/{suffix}")).IsSuccessStatusCode);
        var orderService = new OrderService(db, host.Clock);
        await Assert.ThrowsAsync<DiningException>(() => orderService.CreateAsync(s.Guest, input, default));
        await Assert.ThrowsAsync<DiningException>(() => orderService.CreateAsync(s.Guest, s.Input(), default));
        Assert.Equal(1, await db.Orders.CountAsync(o => o.DiningSessionId == s.Id));
        Assert.Equal(0, await db.Orders.CountAsync(o => o.DiningSessionId == reopened.Session.Id));
    }

    [Theory]
    [InlineData("2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z")]
    [InlineData("2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z")]
    public async Task History_LocalDateAndDst_UsesExactUtcBoundaries(string date, string startText, string endText)
    {
        using var host = new AccountTestHost(database); var s = await Seed(host);
        var start = DateTimeOffset.Parse(startText).UtcDateTime; var end = DateTimeOffset.Parse(endText).UtcDateTime;
        await using var db = database.CreateContext();
        var ids = new List<Guid>();
        foreach (var time in new[] { start.AddSeconds(-1), start, end.AddSeconds(-1), end })
        {
            var row = new DiningSession { RestaurantId = s.RestaurantId, TableLabelSnapshot = "旧桌", Status = DiningSessionStatus.Closed,
                OpenedAt = time.AddHours(-1), ClosedAt = time, CloseReason = SessionCloseReason.Empty, ClosedTotalCents = 0 };
            db.DiningSessions.Add(row); await db.SaveChangesAsync(); ids.Add(row.Id);
        }
        var service = new BillingService(db, host.Clock);
        var first = await service.HistoryAsync(s.RestaurantId, date, date, " 旧桌 ", "EMPTY", null, 1, default);
        Assert.Equal(2, first.TotalCount); Assert.Equal(ids[2], first.Items.Single().SessionId);
        var second = await service.HistoryAsync(s.RestaurantId, date, date, "旧桌", "EMPTY", first.NextCursor, 1, default);
        Assert.Equal(ids[1], second.Items.Single().SessionId); Assert.Null(second.NextCursor);
        await Assert.ThrowsAsync<BillingException>(() => service.HistoryAsync(s.RestaurantId, date, date, "别桌", "EMPTY", first.NextCursor, 1, default));
        await Assert.ThrowsAsync<BillingException>(() => service.HistoryAsync(s.RestaurantId, date, date, "旧桌", "PAID", first.NextCursor, 1, default));
        await Assert.ThrowsAsync<BillingException>(() => service.HistoryAsync(s.RestaurantId, "invalid", date, null, null, null, 1, default));
        host.Clock.Advance(new DateTimeOffset(start.AddHours(10)) - host.Clock.GetUtcNow());
        var today = await service.HistoryAsync(s.RestaurantId, null, null, null, null, null, 1, default);
        Assert.Equal(DateOnly.Parse(date), today.FromDate); Assert.Equal(today.FromDate, today.ToDate);
        host.Clock.Advance(TimeSpan.FromDays(1));
        var pinned = await service.HistoryAsync(s.RestaurantId, null, null, null, null, today.NextCursor, 1, default);
        Assert.Equal(today.FromDate, pinned.FromDate);
    }

    [Fact]
    public async Task History_DeletedCatalogAndScopedCursors_PreservesClosedAmountsAndDetails()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var other = await Seed(host);
        var a = await Create(host, s); var b = await Create(host, s);
        await using var db = database.CreateContext(); var kitchen = new KitchenService(db, host.Clock);
        await kitchen.ReadyAsync(s.RestaurantId, a.Id, default); await kitchen.ReadyAsync(s.RestaurantId, b.Id, default);
        var service = new BillingService(db, host.Clock);
        var closed = await service.CheckoutAsync(s.RestaurantId, s.Id, new(3, 1400), default);
        await new CatalogDeletionService(db).DeleteMenuItemAsync(s.RestaurantId, s.Item.Id, default);
        await new CatalogDeletionService(db).DeleteRestaurantTableAsync(s.RestaurantId, s.Table.Id, default);
        var first = await service.ReadAsync(s.RestaurantId, s.Id, true, null, 1, default);
        var second = await service.ReadAsync(s.RestaurantId, s.Id, true, first.NextCursor, 1, default);
        Assert.Null(first.Summary.TableId); Assert.Equal("8", first.Summary.TableLabel);
        Assert.Equal(closed.TotalAmountCents, first.Summary.TotalAmountCents);
        Assert.Equal(new[] { a.Id, b.Id }, first.Orders.Concat(second.Orders).Select(o => o.Id));
        Assert.All(first.Orders.Concat(second.Orders), o => Assert.Equal("炒饭", o.Items.Single().NameZh));
        await Assert.ThrowsAsync<BillingException>(() => service.ReadAsync(other.RestaurantId, s.Id, true, first.NextCursor, 1, default));
        var history = await service.HistoryAsync(s.RestaurantId, null, null, "8", "PAID", null, 50, default);
        Assert.Single(history.Items); Assert.Equal("Europe/Rome", history.TimeZone);
        Assert.Empty((await service.HistoryAsync(other.RestaurantId, null, null, null, null, null, 50, default)).Items);
    }

    [Theory]
    [InlineData("order", true)][InlineData("order", false)]
    [InlineData("cancel", true)][InlineData("cancel", false)]
    [InlineData("ready", true)][InlineData("ready", false)]
    public async Task Checkout_CompetesWithOrderWriter_RespectsSessionLockInBothOrders(string operation, bool writerFirst)
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var order = await Create(host, s);
        if (operation != "ready")
        { await using var setup = database.CreateContext(); await new KitchenService(setup, host.Clock).ReadyAsync(s.RestaurantId, order.Id, default); }
        var gate = new LockGate(true); var otherGate = new LockGate(false);
        await using var first = Intercepted(gate); await using var second = Intercepted(otherGate);
        var writer = writerFirst ? first : second; var closer = writerFirst ? second : first;
        Task Write() => operation switch
        {
            "order" => new OrderService(writer, host.Clock).CreateAsync(s.Guest, s.Input(), default),
            "cancel" => new KitchenService(writer, host.Clock).CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Owner, new("READY", "退单"), default),
            _ => new KitchenService(writer, host.Clock).ReadyAsync(s.RestaurantId, order.Id, default)
        };
        Task Close() => new BillingService(closer, host.Clock).CheckoutAsync(s.RestaurantId, s.Id, new(2, 700), default);
        Task<Exception?>? writing = writerFirst ? Record.ExceptionAsync(Write) : null;
        Task<Exception?>? closing = writerFirst ? null : Record.ExceptionAsync(Close);
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            if (writerFirst) closing = Record.ExceptionAsync(Close); else writing = Record.ExceptionAsync(Write);
            await otherGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(otherGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        var writeError = await writing!; var closeError = await closing!;
        if (writerFirst)
        {
            Assert.Null(writeError);
            if (operation == "ready") Assert.Null(closeError);
            else Assert.Equal("BILL_CHANGED", Assert.IsType<BillingException>(closeError).Code);
        }
        else if (operation == "ready")
        { Assert.Equal("ORDERS_PENDING", Assert.IsType<BillingException>(closeError).Code); Assert.Null(writeError); }
        else
        { Assert.Null(closeError); Assert.Equal("SESSION_CLOSED", Assert.IsType<DiningException>(writeError).Code); }
    }

    [Fact]
    public async Task Checkout_ConcurrentDuplicates_ReturnsOnePersistedClosure()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var order = await Create(host, s);
        await using var db = database.CreateContext(); await new KitchenService(db, host.Clock).ReadyAsync(s.RestaurantId, order.Id, default);
        async Task<BillSummaryResponse> Attempt()
        { await using var context = database.CreateContext(); return await new BillingService(context, host.Clock).CheckoutAsync(s.RestaurantId, s.Id, new(2, 700), default); }
        var results = await Task.WhenAll(Attempt(), Attempt()); Assert.Equal(results[0], results[1]); Assert.Equal(2, results[0].BillVersion);
    }

    [Theory]
    [InlineData(false)][InlineData(true)]
    public async Task Close_FailureAfterUpdate_RollsBackLifecycleAndCode(bool voided)
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var order = await Create(host, s);
        await using var setup = database.CreateContext(); var kitchen = new KitchenService(setup, host.Clock);
        if (voided) await kitchen.CancelAsync(s.RestaurantId, order.Id, RestaurantUserRole.Staff, new("NEW", "退单"), default);
        else await kitchen.ReadyAsync(s.RestaurantId, order.Id, default);
        await using var db = Intercepted(new FailClose()); var billing = new BillingService(db, host.Clock);
        await Assert.ThrowsAsync<InvalidOperationException>(() => voided ? billing.CloseVoidAsync(s.RestaurantId, s.Id, new(3, 0, true), default)
            : billing.CheckoutAsync(s.RestaurantId, s.Id, new(2, 700), default));
        var saved = await setup.DiningSessions.AsNoTracking().SingleAsync(x => x.Id == s.Id);
        Assert.Equal(DiningSessionStatus.Active, saved.Status); Assert.Null(saved.CloseReason); Assert.Null(saved.ClosedAt);
        Assert.Null(saved.ClosedTotalCents); Assert.NotNull(saved.JoinCodeCiphertext); Assert.Equal(voided ? 3 : 2, saved.BillVersion);
    }

    [Fact]
    public async Task Checkout_ClockMovesBackwards_ClampsToLatestBusinessTimestamp()
    {
        using var host = new AccountTestHost(database); var s = await Seed(host); var order = await Create(host, s);
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        await using var db = database.CreateContext(); var ready = await new KitchenService(db, host.Clock).ReadyAsync(s.RestaurantId, order.Id, default);
        host.Clock.Advance(TimeSpan.FromMinutes(-10));
        var closed = await new BillingService(db, host.Clock).CheckoutAsync(s.RestaurantId, s.Id, new(2, 700), default);
        Assert.Equal(ready.ReadyAt, closed.ClosedAt);
    }

    private async Task<Setup> Seed(AccountTestHost host)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Billing test", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active, OrderingEnabled = true };
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser { Restaurant = restaurant, Username = "billing." + Guid.NewGuid().ToString("N"), PasswordHash = "", Role = role, MustChangePassword = false };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password); return user;
        }
        var owner = User(RestaurantUserRole.Owner); var staff = User(RestaurantUserRole.Staff);
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "8", QrToken = Guid.NewGuid().ToString("N") };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", PriceCents = 700, AllergenReviewed = true };
        db.RestaurantUsers.AddRange(owner, staff); db.RestaurantTables.Add(table); db.MenuItems.Add(item); await db.SaveChangesAsync();
        var opened = await new DiningService(db, host.Services.GetRequiredService<JoinCodes>(), host.Clock).OpenAsync(restaurant.Id, table.Id, default);
        return new(owner, staff, table, item, opened);
    }
    private async Task<OrderResponse> Create(AccountTestHost host, Setup s, CreateOrderInput? input = null)
    { await using var db = database.CreateContext(); return (await new OrderService(db, host.Clock).CreateAsync(s.Guest, input ?? s.Input(), default)).Order; }
    private static async Task<HttpClient> Login(AccountTestHost host, RestaurantUser user)
    { var client = host.Browser(); Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode); return client; }
    private sealed record Token([property: System.Text.Json.Serialization.JsonPropertyName("token")] string Value);
    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);
    private sealed class FailClose : DbCommandInterceptor
    {
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand cmd, CommandExecutedEventData data, int result, CancellationToken ct = default)
        {
            if (cmd.CommandText.StartsWith("UPDATE dining_sessions", StringComparison.Ordinal)) throw new InvalidOperationException("Injected closure failure.");
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
