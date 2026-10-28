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

public sealed class KitchenTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Kitchen-test-password-123";
    private const string List = "/api/staff/orders";
    private static string Path(Guid id) => $"{List}/{id}";
    private static string ItemPath(OrderResponse order) => $"{Path(order.Id)}/items/{order.Items.Single().Id}";
    private sealed record Setup(RestaurantUser Staff, RestaurantUser Owner, RestaurantTable Table,
        MenuItem Item, OpenSessionResponse Opened)
    {
        public Guid RestaurantId => Staff.RestaurantId;
        public GuestIdentity Guest => new(RestaurantId, Table.Id, Opened.Session.SessionId);
        public CreateOrderInput Input() => new(Guest.SessionId, Guid.NewGuid(), [new(Item.Id, 1, 700, "少盐")]);
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
        foreach (var secret in new[] { "clientRequestId", "joinCode", "passwordHash", "cancelReason" }) Assert.DoesNotContain(secret, json);
        foreach (var query in new[] { "?cursor=broken", "?status=bad", "?limit=0", "?limit=101", "?status=PROCESSED&cursor=" + first.NextCursor })
            await AssertErrorAsync(await staff.GetAsync(List + query), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        using var foreign = await LoginAsync(host, other.Staff);
        await AssertErrorAsync(await foreign.GetAsync(List + "?cursor=" + first.NextCursor), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
    }

    [Fact]
    public async Task Transitions_RolesAndGuestRecovery_PreserveSnapshotsAndOnlyCancelNewItems()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var input = s.Input() with { Items = [new(s.Item.Id, 3, 700, "少盐"), new(s.Item.Id, 1, 700, "正常")] };
        var order = await CreateAsync(host, s, input);
        var first = order.Items.Single(i => i.Quantity == 3); var second = order.Items.Single(i => i.Quantity == 1);
        var firstPath = $"{Path(order.Id)}/items/{first.Id}";
        var secondPath = $"{Path(order.Id)}/items/{second.Id}";
        using var staff = await LoginAsync(host, s.Staff); using var owner = await LoginAsync(host, s.Owner);
        var ready = await PostAsync(staff, firstPath + "/ready", new { });
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var partial = (await ready.Content.ReadFromJsonAsync<KitchenOrderResponse>())!;
        Assert.Equal("NEW", partial.Status); Assert.Null(partial.ProcessedAt);
        Assert.Equal(3, partial.Items.Single(i => i.Id == first.Id).Quantity); Assert.Equal("READY", partial.Items.Single(i => i.Id == first.Id).Status);
        Assert.Equal("NEW", partial.Items.Single(i => i.Id == second.Id).Status); Assert.Equal(2800, partial.PayableAmountCents);
        Assert.Equal(2, await VersionAsync(s));
        foreach (var client in new[] { staff, owner })
            await AssertErrorAsync(await PostAsync(client, firstPath + "/cancel", new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, firstPath + "/ready", new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        host.Clock.Advance(TimeSpan.FromSeconds(2));
        var cancelled = (await (await PostAsync(staff, secondPath + "/cancel", new { })).Content.ReadFromJsonAsync<KitchenOrderResponse>())!;
        Assert.Equal("PROCESSED", cancelled.Status); Assert.Equal("CANCELLED", cancelled.Items.Single(i => i.Id == second.Id).Status);
        Assert.Equal(2800, cancelled.TotalAmountCents); Assert.Equal(2100, cancelled.PayableAmountCents);
        Assert.Equal(cancelled.Items.Single(i => i.Id == second.Id).CancelledAt, cancelled.ProcessedAt);
        Assert.Equal(partial.Items.Single(i => i.Id == first.Id).ReadyAt, cancelled.Items.Single(i => i.Id == first.Id).ReadyAt); Assert.Equal(3, await VersionAsync(s));
        await AssertErrorAsync(await PostAsync(owner, secondPath + "/cancel", new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        await AssertErrorAsync(await PostAsync(owner, secondPath + "/ready", new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        Assert.Equal(HttpStatusCode.NotFound, (await PostAsync(staff, Path(order.Id) + "/ready", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PostAsync(staff, Path(order.Id) + "/cancel", new { })).StatusCode);
        using var guest = host.Browser();
        var token = (await guest.GetFromJsonAsync<Token>("/api/public/csrf"))!.Value;
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(guest, $"/api/public/qr/{s.Table.QrToken}/join",
            new JoinInput(s.Guest.SessionId, s.Opened.JoinCode), token)).StatusCode);
        var page = (await guest.GetFromJsonAsync<OrderPage>($"/api/public/sessions/{s.Guest.SessionId}/orders"))!;
        Assert.Equal(2100, page.TotalAmountCents); Assert.Equal("CANCELLED", page.Items.Single().Items.Single(i => i.Id == second.Id).Status);
        await using var db = database.CreateContext();
        var recovered = await new OrderService(db, host.Clock).CreateAsync(s.Guest, input, default);
        Assert.False(recovered.Created); Assert.Equal(2800, recovered.Order.TotalAmountCents); Assert.Equal(2100, recovered.Order.PayableAmountCents);
        var bill = await SessionSummaries.ReadAsync(db, s.RestaurantId, s.Guest.SessionId, default);
        Assert.Equal(2, bill.ItemCount); Assert.Equal(0, bill.NewItemCount); Assert.Equal(1, bill.CancelledItemCount);
        var closed = await new BillingService(db, host.Clock).CheckoutAsync(s.RestaurantId, s.Guest.SessionId, new(3, 2100), default);
        Assert.Equal(2100, closed.TotalAmountCents);
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
        await AssertErrorAsync(await staff.PostAsJsonAsync(ItemPath(order) + "/ready", new { }), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await staff.PostAsJsonAsync(ItemPath(order) + "/cancel", new { expectedStatus = "NEW", reason = "取消" }), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await foreign.GetAsync(Path(order.Id)), HttpStatusCode.NotFound, "ORDER_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, ItemPath(order) + "/ready", new { }), HttpStatusCode.NotFound, "ORDER_ITEM_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(foreign, ItemPath(order) + "/cancel", new { }), HttpStatusCode.NotFound, "ORDER_ITEM_NOT_FOUND");
        var another = await CreateAsync(host, s);
        await AssertErrorAsync(await PostAsync(staff, $"{Path(order.Id)}/items/{another.Items.Single().Id}/cancel", new { }), HttpStatusCode.NotFound, "ORDER_ITEM_NOT_FOUND");
        await using var db = database.CreateContext();
        await db.RestaurantUsers.Where(u => u.Id == s.Staff.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.MustChangePassword, true));
        await AssertErrorAsync(await staff.GetAsync(List), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        await AssertErrorAsync(await PostAsync(staff, ItemPath(order) + "/ready", new { }), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
    }

    [Fact]
    public async Task List_ProcessedOrderingAndClosedSessions_UsesActionTimeAndKeepsCreationCounter()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var a = await CreateAsync(host, s); var b = await CreateAsync(host, s); var c = await CreateAsync(host, s);
        await using var db = database.CreateContext();
        var service = new KitchenService(db, host.Clock);
        await service.ReadyAsync(s.RestaurantId, b.Id, b.Items.Single().Id, default);
        host.Clock.Advance(TimeSpan.FromSeconds(1));
        await service.ReadyAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default);
        await service.ReadyAsync(s.RestaurantId, c.Id, c.Items.Single().Id, default);
        var first = await service.ListAsync(s.RestaurantId, "PROCESSED", null, 1, default);
        var rest = await service.ListAsync(s.RestaurantId, "PROCESSED", first.NextCursor, 100, default);
        Assert.Equal(new[] { c.Id, a.Id, b.Id }, first.Items.Concat(rest.Items).Select(x => x.Id));
        await CloseForTest(db, s, host.Clock);
        var empty = await service.ListAsync(s.RestaurantId, "PROCESSED", null, 50, default);
        Assert.Empty(empty.Items); Assert.Equal(0, empty.TotalCount); Assert.Equal(3, empty.CreatedOrderCount);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => service.ReadAsync(s.RestaurantId, a.Id, default))).Code);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => service.ReadyAsync(s.RestaurantId, b.Id, b.Items.Single().Id, default))).Code);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => service.CancelAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default))).Code);
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
        await service.ReadyAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default);
        Assert.Equal("ORDER_ITEM_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => service.CancelAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default))).Code);
        await db.DiningSessions.Where(x => x.Id == s.Guest.SessionId).ExecuteUpdateAsync(u => u.SetProperty(x => x.BillVersion, int.MaxValue));
        Assert.Equal("BILL_LIMIT_REACHED", (await Assert.ThrowsAsync<ApiException>(() => service.CancelAsync(s.RestaurantId, b.Id, b.Items.Single().Id, default))).Code);
        Assert.Equal("NEW", (await service.ReadAsync(s.RestaurantId, b.Id, default)).Status);
        await service.ReadyAsync(s.RestaurantId, b.Id, b.Items.Single().Id, default);
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
                if (cancel) await service.CancelAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
                else await service.ReadyAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
            });
        }
        var errors = await Task.WhenAll(Attempt(cancelA), Attempt(cancelB));
        Assert.Single(errors, e => e is null);
        Assert.Equal("ORDER_ITEM_CHANGED", Assert.IsType<ApiException>(errors.Single(e => e is not null)).Code);
        await using var check = database.CreateContext();
        var saved = await check.OrderItems.SingleAsync(i => i.OrderId == order.Id);
        Assert.Equal(saved.Status == OrderItemStatus.Cancelled ? 3 : 2, await VersionAsync(s));
    }

    [Fact]
    public async Task Cancel_ConcurrentNewSubmissionAndOtherCancellation_IncrementsEveryActualChange()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var a = await CreateAsync(host, s); var b = await CreateAsync(host, s);
        async Task Cancel(OrderResponse order)
        {
            await using var db = database.CreateContext();
            await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
        }
        await Task.WhenAll(Cancel(a), Cancel(b), CreateAsync(host, s));
        Assert.Equal(6, await VersionAsync(s));
        await using var check = database.CreateContext();
        Assert.Equal(700, await check.Orders.Where(o => o.DiningSessionId == s.Guest.SessionId).SelectMany(o => o.Items).Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity));
    }

    [Fact]
    public async Task Cancel_FailureAfterVersionUpdate_RollsBackOrderMetadataAndVersion()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var order = await CreateAsync(host, s);
        await using var db = Intercepted(new FailVersion());
        await Assert.ThrowsAsync<InvalidOperationException>(() => new KitchenService(db, host.Clock)
            .CancelAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default));
        await using var check = database.CreateContext();
        var saved = await check.OrderItems.SingleAsync(i => i.OrderId == order.Id);
        Assert.Equal(OrderItemStatus.New, saved.Status); Assert.Null(saved.CancelledAt);
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
            await RowLocks.SessionAsync(closeDb, s.RestaurantId, s.Guest.SessionId, RowLock.Update, default);
            await CloseForTest(closeDb, s, host.Clock);
            await tx.CommitAsync();
        }
        Task<KitchenOrderResponse> Cancel() => new KitchenService(cancelDb, host.Clock)
            .CancelAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
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
        if (cancelFirst) Assert.Equal("CANCELLED", (await cancelling!).Items.Single().Status);
        else Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() => cancelling!)).Code);
        Assert.Equal(cancelFirst ? 3 : 2, await VersionAsync(s));
    }

    [Fact]
    public async Task Changes_DifferentItemsConcurrently_ProcessesOrderAndCountsEachCancellationOnce()
    {
        using var host = new AccountTestHost(database); var s = await SeedAsync(host);
        var order = await CreateAsync(host, s, s.Input() with { Items = [new(s.Item.Id, 3, 700, "少盐"), new(s.Item.Id, 2, 700, "正常")] });
        async Task Cancel(Guid itemId)
        {
            await using var db = database.CreateContext();
            await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, order.Id, itemId, default);
        }
        await Task.WhenAll(order.Items.Select(i => Cancel(i.Id)));
        await using var check = database.CreateContext();
        var result = await new KitchenService(check, host.Clock).ReadAsync(s.RestaurantId, order.Id, default);
        Assert.Equal("PROCESSED", result.Status); Assert.Equal(3500, result.TotalAmountCents); Assert.Equal(0, result.PayableAmountCents);
        Assert.All(result.Items, i => { Assert.Equal("CANCELLED", i.Status); Assert.Null(i.ReadyAt); });
        var bill = await SessionSummaries.ReadAsync(check, s.RestaurantId, s.Guest.SessionId, default);
        Assert.Equal(4, bill.BillVersion); Assert.Equal(2, bill.ItemCount); Assert.Equal(2, bill.CancelledItemCount);
        var closed = await new BillingService(check, host.Clock).CloseVoidAsync(s.RestaurantId, s.Guest.SessionId, new(4, 0, true), default);
        Assert.Equal("VOIDED", closed.CloseReason);
    }

    [Fact]
    public async Task Processing_ClockMovesBackwards_UsesLatestItemTimeAndKeepsPendingBillBlocked()
    {
        using var host = new AccountTestHost(database); var s = await SeedAsync(host);
        var order = await CreateAsync(host, s, s.Input() with { Items = [new(s.Item.Id, 1, 700, "A"), new(s.Item.Id, 1, 700, "B")] });
        await using var db = database.CreateContext(); var kitchen = new KitchenService(db, host.Clock);
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        var first = await kitchen.ReadyAsync(s.RestaurantId, order.Id, order.Items[0].Id, default);
        var billing = new BillingService(db, host.Clock);
        Assert.Equal("ORDERS_PENDING", (await Assert.ThrowsAsync<ApiException>(() => billing.CheckoutAsync(s.RestaurantId, s.Guest.SessionId, new(2, 1400), default))).Code);
        host.Clock.Advance(TimeSpan.FromMinutes(-10));
        var last = await kitchen.CancelAsync(s.RestaurantId, order.Id, order.Items[1].Id, default);
        Assert.Equal(order.CreatedAt, last.Items[1].CancelledAt);
        Assert.Equal(first.Items[0].ReadyAt, last.ProcessedAt);
        var closed = await billing.CheckoutAsync(s.RestaurantId, s.Guest.SessionId, new(3, 700), default);
        Assert.Equal(last.ProcessedAt, closed.ClosedAt);
    }

    [Fact]
    public async Task Create_PartiallyCancelledBill_UsesRemainingReceivablesForSafeIntegerLimit()
    {
        using var host = new AccountTestHost(database); var s = await SeedAsync(host);
        const long price = InputRules.MaxSafeCents / 2;
        await using var db = database.CreateContext();
        await db.MenuItems.Where(i => i.Id == s.Item.Id).ExecuteUpdateAsync(u => u.SetProperty(i => i.PriceCents, price));
        var input = s.Input() with { Items = [new(s.Item.Id, 1, price, "A"), new(s.Item.Id, 1, price, "B")] };
        var order = await CreateAsync(host, s, input);
        await new KitchenService(db, host.Clock).CancelAsync(s.RestaurantId, order.Id, order.Items[0].Id, default);
        var single = s.Input() with { Items = [new(s.Item.Id, 1, price, null)] };
        await CreateAsync(host, s, single);
        Assert.Equal("BILL_LIMIT_REACHED", (await Assert.ThrowsAsync<ApiException>(() => CreateAsync(host, s, single with { ClientRequestId = Guid.NewGuid() }))).Code);
        Assert.Equal(price * 2, (await SessionSummaries.ReadAsync(db, s.RestaurantId, s.Guest.SessionId, default)).TotalAmountCents);
    }

    [Fact]
    public async Task Pass_ListAndServed_ShowsOnlyWaitingReadyItemsAndServesOnce()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host);
        var order = await CreateAsync(host, s, s.Input() with
        {
            Items = [new(s.Item.Id, 2, 700, "少盐"), new(s.Item.Id, 1, 700, "正常"), new(s.Item.Id, 1, 700, "辣")]
        });
        var first = order.Items.Single(i => i.Remark == "少盐"); var second = order.Items.Single(i => i.Remark == "正常");
        var third = order.Items.Single(i => i.Remark == "辣");
        string Served(Guid itemId) => $"{Path(order.Id)}/items/{itemId}/served";
        using var staff = await LoginAsync(host, s.Staff); using var owner = await LoginAsync(host, s.Owner);
        var empty = (await staff.GetFromJsonAsync<PassPage>("/api/staff/pass"))!;
        Assert.Empty(empty.Items); Assert.Equal(0, empty.TotalCount); Assert.Null(empty.LatestReadyAt);
        await using (var db = database.CreateContext())
        {
            var service = new KitchenService(db, host.Clock);
            await service.ReadyAsync(s.RestaurantId, order.Id, first.Id, default);
            host.Clock.Advance(TimeSpan.FromSeconds(1));
            await service.ReadyAsync(s.RestaurantId, order.Id, second.Id, default);
            await service.CancelAsync(s.RestaurantId, order.Id, third.Id, default);
        }
        var fresh = await CreateAsync(host, s);
        var version = await VersionAsync(s);
        var page = (await staff.GetFromJsonAsync<PassPage>("/api/staff/pass?limit=1"))!;
        var rest = (await staff.GetFromJsonAsync<PassPage>("/api/staff/pass?limit=1&cursor=" + page.NextCursor))!;
        Assert.Equal(2, page.TotalCount); Assert.Null(rest.NextCursor);
        Assert.Equal(new[] { first.Id, second.Id }, page.Items.Concat(rest.Items).Select(i => i.Id));
        var waiting = page.Items.Single();
        Assert.Equal(order.Id, waiting.OrderId); Assert.Equal(s.Guest.SessionId, waiting.SessionId);
        Assert.Equal("8", waiting.TableLabel); Assert.Equal("炒饭", waiting.NameZh); Assert.Equal(2, waiting.Quantity);
        Assert.Equal("少盐", waiting.Remark); Assert.Null(waiting.ServedAt);
        Assert.Equal(rest.Items.Single().ReadyAt, page.LatestReadyAt);
        var json = await staff.GetStringAsync("/api/staff/pass");
        foreach (var secret in new[] { "clientRequestId", "joinCode", "unitPriceCents" }) Assert.DoesNotContain(secret, json);

        host.Clock.Advance(TimeSpan.FromSeconds(5));
        var response = await PostAsync(staff, Served(first.Id), new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var served = (await response.Content.ReadFromJsonAsync<PassItemResponse>())!;
        Assert.Equal(first.Id, served.Id); Assert.NotNull(served.ServedAt); Assert.True(served.ServedAt >= served.ReadyAt);
        await AssertErrorAsync(await PostAsync(owner, Served(first.Id), new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Served(third.Id), new { }), HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, $"{Path(fresh.Id)}/items/{fresh.Items.Single().Id}/served", new { }),
            HttpStatusCode.Conflict, "ORDER_ITEM_CHANGED");
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(owner, Served(second.Id), new { })).StatusCode);
        var drained = (await staff.GetFromJsonAsync<PassPage>("/api/staff/pass"))!;
        Assert.Empty(drained.Items); Assert.Equal(0, drained.TotalCount); Assert.Null(drained.LatestReadyAt);
        // Serving touches neither the bill nor the kitchen's view of the order.
        Assert.Equal(version, await VersionAsync(s));
        var kitchen = (await staff.GetFromJsonAsync<KitchenOrderResponse>(Path(order.Id)))!;
        Assert.Equal("PROCESSED", kitchen.Status); Assert.Equal(2100, kitchen.PayableAmountCents);
        Assert.Equal("READY", kitchen.Items.Single(i => i.Id == first.Id).Status);
    }

    [Fact]
    public async Task Pass_ClosedSessionsTenantsAndCallers_HideItemsAndRejectInvalidWrites()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var other = await SeedAsync(host);
        var a = await CreateAsync(host, s); var b = await CreateAsync(host, s);
        await using var db = database.CreateContext();
        var service = new KitchenService(db, host.Clock);
        await service.ReadyAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default);
        await service.ReadyAsync(s.RestaurantId, b.Id, b.Items.Single().Id, default);
        using var anonymous = host.Browser(); using var staff = await LoginAsync(host, s.Staff);
        using var foreign = await LoginAsync(host, other.Owner);
        await AssertErrorAsync(await anonymous.GetAsync("/api/staff/pass"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        await AssertErrorAsync(await staff.PostAsJsonAsync(ItemPath(a) + "/served", new { }), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await PostAsync(foreign, ItemPath(a) + "/served", new { }), HttpStatusCode.NotFound, "ORDER_ITEM_NOT_FOUND");
        await AssertErrorAsync(await PostAsync(staff, $"{Path(a.Id)}/items/{b.Items.Single().Id}/served", new { }),
            HttpStatusCode.NotFound, "ORDER_ITEM_NOT_FOUND");
        var foreignPage = (await foreign.GetFromJsonAsync<PassPage>("/api/staff/pass"))!;
        Assert.Empty(foreignPage.Items); Assert.Null(foreignPage.LatestReadyAt);
        var first = (await staff.GetFromJsonAsync<PassPage>("/api/staff/pass?limit=1"))!;
        foreach (var query in new[] { "?cursor=broken", "?limit=0", "?limit=101" })
            await AssertErrorAsync(await staff.GetAsync("/api/staff/pass" + query), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await foreign.GetAsync("/api/staff/pass?cursor=" + first.NextCursor), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await staff.GetAsync(List + "?cursor=" + first.NextCursor), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        // Only READY items can be served, and never before they were ready.
        var pending = await CreateAsync(host, s);
        foreach (var (orderId, at) in new[] { (pending.Id, host.Clock.GetUtcNow().UtcDateTime), (a.Id, DateTime.UnixEpoch) })
        {
            var violation = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.OrderItems
                .Where(i => i.OrderId == orderId).ExecuteUpdateAsync(u => u.SetProperty(i => i.ServedAt, at)));
            Assert.Equal("ck_order_item_served", violation.ConstraintName);
        }

        await CloseForTest(db, s, host.Clock);
        var closed = await service.PassAsync(s.RestaurantId, null, 50, default);
        Assert.Empty(closed.Items); Assert.Equal(0, closed.TotalCount);
        // Closing never moves the watermark, so it cannot sound like a newly ready dish.
        Assert.Equal(first.LatestReadyAt, closed.LatestReadyAt);
        Assert.Equal("SESSION_CLOSED", (await Assert.ThrowsAsync<ApiException>(() =>
            service.ServedAsync(s.RestaurantId, a.Id, a.Items.Single().Id, default))).Code);
    }

    [Fact]
    public async Task Served_TwoConcurrentDevices_OnlyOneSucceeds()
    {
        using var host = new AccountTestHost(database);
        var s = await SeedAsync(host); var order = await CreateAsync(host, s);
        await using (var db = database.CreateContext())
            await new KitchenService(db, host.Clock).ReadyAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
        async Task<Exception?> Attempt()
        {
            await using var db = database.CreateContext();
            return await Record.ExceptionAsync(() =>
                new KitchenService(db, host.Clock).ServedAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default));
        }
        var errors = await Task.WhenAll(Attempt(), Attempt());
        Assert.Single(errors, e => e is null);
        Assert.Equal("ORDER_ITEM_CHANGED", Assert.IsType<ApiException>(errors.Single(e => e is not null)).Code);
        await using var check = database.CreateContext();
        var saved = await check.OrderItems.SingleAsync(i => i.OrderId == order.Id);
        Assert.Equal(OrderItemStatus.Ready, saved.Status); Assert.NotNull(saved.ServedAt);
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
        var total = await db.Orders.Where(o => o.DiningSessionId == s.Guest.SessionId).SelectMany(o => o.Items).Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity);
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
