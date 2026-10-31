using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Pickup;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class PickupAcceptanceTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Pickup-desk-password-123";
    // Monday 2 November 2026, 11:00 in Rome.
    private static readonly DateTimeOffset Monday = DateTimeOffset.Parse("2026-11-02T10:00:00Z");

    private sealed record Setup(Guid RestaurantId, string Slug, RestaurantUser Owner, RestaurantUser Staff, MenuItem Item);
    private static string Accept(Guid id) => $"/api/staff/pickup/requests/{id}/accept";
    private static string Reject(Guid id) => $"/api/staff/pickup/requests/{id}/reject";

    [Fact]
    public async Task Accept_PendingRequest_CreatesPickupSessionAndOrderAtAcceptanceTime()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        using var owner = await LoginAsync(host, s.Owner);
        var (request, token) = await SubmitAsync(host, s);

        // Waiting requests stay out of the kitchen, the bills and the history.
        var before = (await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders"))!;
        Assert.Equal((0L, (DateTime?)null), (before.TotalCount, before.LatestCreatedAt));
        Assert.Empty((await staff.GetFromJsonAsync<ActiveSessionsResponse>("/api/staff/sessions/active"))!.Items);
        Assert.Empty((await owner.GetFromJsonAsync<HistoryPage>("/api/owner/history"))!.Items);
        var pending = (await staff.GetFromJsonAsync<PendingPickupsResponse>("/api/staff/pickup/pending"))!;
        Assert.Equal(PickupState.PendingLimit, pending.Limit);
        var shown = Assert.Single(pending.Items);
        Assert.Equal((request.Id, 1, "Marco", "+393331234567", 1400L), (shown.Id, shown.PickupNumber, shown.CustomerName, shown.CustomerPhone, shown.TotalAmountCents));
        Assert.Equal(("炒饭", 2, "少辣"), (shown.Items.Single().NameZh, shown.Items.Single().Quantity, shown.Items.Single().Remark));

        host.Clock.Advance(TimeSpan.FromMinutes(3));
        var acceptedAt = host.Clock.GetUtcNow().UtcDateTime;
        await AssertErrorAsync(await PostAsync(staff, Accept(request.Id), new { estimatedMinutes = 25 }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        var response = await PostAsync(staff, Accept(request.Id), new { estimatedMinutes = 20 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accepted = (await response.Content.ReadFromJsonAsync<AcceptedPickupResponse>())!;
        Assert.Equal((1, acceptedAt.AddMinutes(20)), (accepted.PickupNumber, accepted.EstimatedReadyAt));

        var kitchen = (await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders"))!;
        var order = Assert.Single(kitchen.Items);
        Assert.Equal((acceptedAt, acceptedAt), (order.CreatedAt, kitchen.LatestCreatedAt!.Value));
        Assert.Equal(("PICKUP", (string?)null, accepted.SessionId, "NEW"), (order.Channel, order.TableLabel, order.SessionId, order.Status));
        Assert.Equal(("炒饭", 2, "少辣", 700L), (order.Items.Single().NameZh, order.Items.Single().Quantity, order.Items.Single().Remark, order.Items.Single().UnitPriceCents));
        var bill = Assert.Single((await staff.GetFromJsonAsync<ActiveSessionsResponse>("/api/staff/sessions/active"))!.Items);
        Assert.Equal(("PICKUP", "ACTIVE", 1, 1400L, acceptedAt), (bill.Channel, bill.Status, bill.BillVersion, bill.TotalAmountCents, bill.OpenedAt));
        Assert.Empty((await staff.GetFromJsonAsync<PendingPickupsResponse>("/api/staff/pickup/pending"))!.Items);
        await using var db = database.CreateContext();
        var saved = await db.PickupRequests.SingleAsync(r => r.Id == request.Id);
        Assert.Equal((acceptedAt, accepted.SessionId), (saved.AcceptedAt, saved.SessionId));
        Assert.Equal(request.ClientRequestId, await db.Orders.Where(o => o.Id == order.Id).Select(o => o.ClientRequestId).SingleAsync());

        // The guest's page follows the kitchen.
        using var guest = host.Browser();
        var status = (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{token}"))!;
        Assert.Equal(("ACCEPTED", accepted.EstimatedReadyAt), (status.Status, status.EstimatedReadyAt));
        await new KitchenService(db, host.Clock).ReadyAsync(s.RestaurantId, order.Id, order.Items.Single().Id, default);
        Assert.Equal("READY", (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{token}"))!.Status);

        // Repeats and late rejections change nothing.
        await AssertErrorAsync(await PostAsync(staff, Accept(request.Id), new { estimatedMinutes = 20 }), HttpStatusCode.Conflict, "PICKUP_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Reject(request.Id), new { }), HttpStatusCode.Conflict, "PICKUP_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Accept(Guid.NewGuid()), new { estimatedMinutes = 20 }), HttpStatusCode.NotFound, "PICKUP_NOT_FOUND");
        Assert.Equal(1, await db.DiningSessions.CountAsync(x => x.RestaurantId == s.RestaurantId));
    }

    [Fact]
    public async Task Decisions_ExpiryBoundary_AcceptBeforeAndRejectNeitherAfter()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        var (first, _) = await SubmitAsync(host, s);
        var (second, _) = await SubmitAsync(host, s);
        host.Clock.Advance(PickupState.Lifetime - TimeSpan.FromTicks(10));
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, Accept(first.Id), new { estimatedMinutes = 15 })).StatusCode);
        host.Clock.Advance(TimeSpan.FromTicks(10));
        await AssertErrorAsync(await PostAsync(staff, Accept(second.Id), new { estimatedMinutes = 15 }), HttpStatusCode.Conflict, "PICKUP_CHANGED");
        await AssertErrorAsync(await PostAsync(staff, Reject(second.Id), new { }), HttpStatusCode.Conflict, "PICKUP_CHANGED");
        Assert.Empty((await staff.GetFromJsonAsync<PendingPickupsResponse>("/api/staff/pickup/pending"))!.Items);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Decisions_AcceptAndRejectRace_OnlyTheFirstApplies(bool acceptFirst)
    {
        using var host = Host();
        var s = await SeedAsync();
        var (request, _) = await SubmitAsync(host, s);
        var gate = new Gate("FROM pickup_requests", true);
        var secondGate = new Gate("FROM pickup_requests", false);
        await using var first = Intercepted(gate);
        await using var second = Intercepted(secondGate);
        Task Accept(ApplicationDbContext db) => new PickupDeskService(db, host.Clock).AcceptAsync(s.RestaurantId, request.Id, 15, default);
        Task RejectIt(ApplicationDbContext db) => new PickupDeskService(db, host.Clock).RejectAsync(s.RestaurantId, request.Id, "BUSY", default);
        var winner = acceptFirst ? Accept(first) : RejectIt(first);
        Task loser;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            loser = acceptFirst ? RejectIt(second) : Accept(second);
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Task.Delay(200);
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        await winner;
        Assert.Equal("PICKUP_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => loser)).Code);
        await using var db = database.CreateContext();
        var saved = await db.PickupRequests.SingleAsync(r => r.Id == request.Id);
        Assert.Equal(acceptFirst, saved.AcceptedAt is not null);
        Assert.Equal(!acceptFirst, saved.RejectedAt is not null);
        Assert.Equal(acceptFirst ? 1 : 0, await db.DiningSessions.CountAsync(x => x.RestaurantId == s.RestaurantId));
    }

    [Fact]
    public async Task Accept_DishDeletedAfterSubmission_KeepsSnapshotWithoutReference()
    {
        using var host = Host();
        var s = await SeedAsync();
        var (request, _) = await SubmitAsync(host, s);
        await using var db = database.CreateContext();
        Assert.Equal(CatalogDeletionResult.Deleted, await new CatalogDeletionService(db).DeleteMenuItemAsync(s.RestaurantId, s.Item.Id));
        Assert.Null(await db.PickupRequestItems.Where(i => i.PickupRequestId == request.Id).Select(i => i.MenuItemId).SingleAsync());
        await new PickupDeskService(db, host.Clock).AcceptAsync(s.RestaurantId, request.Id, 15, default);
        var item = await db.OrderItems.SingleAsync(i => i.RestaurantId == s.RestaurantId);
        Assert.Equal(((Guid?)null, "炒饭", 700L), (item.MenuItemId, item.NameZhSnapshot, item.UnitPriceCents));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Accept_RacingDishDeletion_KeepsSnapshotsInBothOrders(bool acceptFirst)
    {
        using var host = Host();
        var s = await SeedAsync();
        var (request, _) = await SubmitAsync(host, s);
        var gate = new Gate("FROM restaurants", true);
        var secondGate = new Gate("FROM restaurants", false);
        await using var first = Intercepted(gate);
        await using var second = Intercepted(secondGate);
        Task Accept(ApplicationDbContext db) => new PickupDeskService(db, host.Clock).AcceptAsync(s.RestaurantId, request.Id, 15, default);
        Task Delete(ApplicationDbContext db) => new CatalogDeletionService(db).DeleteMenuItemAsync(s.RestaurantId, s.Item.Id);
        var running = acceptFirst ? Accept(first) : Delete(first);
        Task other;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            other = acceptFirst ? Delete(second) : Accept(second);
            await secondGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Task.Delay(200);
            Assert.False(secondGate.Acquired.Task.IsCompleted);
        }
        finally { gate.Release.TrySetResult(); }
        await running;
        await other;
        await using var db = database.CreateContext();
        Assert.False(await db.MenuItems.AnyAsync(i => i.Id == s.Item.Id));
        var item = await db.OrderItems.SingleAsync(i => i.RestaurantId == s.RestaurantId);
        Assert.Equal(((Guid?)null, "炒饭"), (item.MenuItemId, item.NameZhSnapshot));
        Assert.Null(await db.PickupRequestItems.Where(i => i.PickupRequestId == request.Id).Select(i => i.MenuItemId).SingleAsync());
    }

    [Fact]
    public async Task Reject_WithOrWithoutReason_ShowsGuestAndTodaysUnacceptedList()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        using var guest = host.Browser();
        var (soldOut, soldOutToken) = await SubmitAsync(host, s);
        var (plain, plainToken) = await SubmitAsync(host, s);
        var (expired, _) = await SubmitAsync(host, s);
        var (taken, _) = await SubmitAsync(host, s);
        await AssertErrorAsync(await PostAsync(staff, Reject(soldOut.Id), new { reason = "sold_out" }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(staff, Reject(soldOut.Id), new { reason = "SOLD_OUT" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(staff, Reject(plain.Id), new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, Accept(taken.Id), new { estimatedMinutes = 30 })).StatusCode);
        var withReason = (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{soldOutToken}"))!;
        Assert.Equal(("REJECTED", "SOLD_OUT"), (withReason.Status, withReason.RejectReason));
        var withoutReason = (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{plainToken}"))!;
        Assert.Equal(("REJECTED", (string?)null), (withoutReason.Status, withoutReason.RejectReason));

        // Still waiting: on the pending list, not yet among the unaccepted.
        var list = (await staff.GetFromJsonAsync<UnacceptedPickupsResponse>("/api/staff/pickup/unaccepted"))!;
        Assert.Equal(new[] { (2, "REJECTED", (string?)null), (1, "REJECTED", "SOLD_OUT") },
            list.Items.Select(x => (x.PickupNumber, x.Outcome, x.RejectReason)));
        host.Clock.Advance(PickupState.Lifetime);
        list = (await staff.GetFromJsonAsync<UnacceptedPickupsResponse>("/api/staff/pickup/unaccepted"))!;
        Assert.Equal(new[] { expired.PickupNumber, plain.PickupNumber, soldOut.PickupNumber }, list.Items.Select(x => x.PickupNumber));
        Assert.Equal(("EXPIRED", "+393331234567", new DateOnly(2026, 11, 2)), (list.Items[0].Outcome, list.Items[0].CustomerPhone, list.BusinessDate));
        // The next local day starts an empty list.
        host.Clock.Advance(TimeSpan.FromDays(1));
        Assert.Empty((await staff.GetFromJsonAsync<UnacceptedPickupsResponse>("/api/staff/pickup/unaccepted"))!.Items);
    }

    [Fact]
    public async Task Closure_PickupVisits_PickedUpNoShowAndVoidedReachHistoryByChannel()
    {
        using var host = Host();
        var s = await SeedAsync();
        using var staff = await LoginAsync(host, s.Staff);
        using var owner = await LoginAsync(host, s.Owner);
        using var guest = host.Browser();
        async Task<(KitchenOrderResponse Order, string Token)> AcceptedAsync()
        {
            var (request, token) = await SubmitAsync(host, s);
            var accepted = (await (await PostAsync(staff, Accept(request.Id), new { estimatedMinutes = 15 }))
                .Content.ReadFromJsonAsync<AcceptedPickupResponse>())!;
            var order = (await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders"))!.Items.Single(o => o.SessionId == accepted.SessionId);
            return (order, token);
        }
        var (paid, paidToken) = await AcceptedAsync();
        var (noShow, noShowToken) = await AcceptedAsync();
        var (voided, voidedToken) = await AcceptedAsync();
        Assert.Equal(new SessionPickupResponse(1, "Marco", Monday.UtcDateTime.AddMinutes(15)), paid.Pickup);
        await using var db = database.CreateContext();
        var kitchen = new KitchenService(db, host.Clock);
        await kitchen.ReadyAsync(s.RestaurantId, paid.Id, paid.Items.Single().Id, default);
        var pass = Assert.Single((await staff.GetFromJsonAsync<PassPage>("/api/staff/pass"))!.Items);
        Assert.Equal(("PICKUP", (string?)null, 1, "Marco"), (pass.Channel, pass.TableLabel, pass.Pickup!.Number, pass.Pickup.CustomerName));
        var bill = (await staff.GetFromJsonAsync<BillSummaryResponse>($"/api/staff/sessions/{paid.SessionId}"))!;
        Assert.Equal(new BillPickupResponse(1, "Marco", "+393331234567", Monday.UtcDateTime.AddMinutes(15)), bill.Pickup);

        // Picked up: the ordinary PAID checkout, which also marks the dish served.
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(owner, $"/api/owner/sessions/{paid.SessionId}/checkout", new CheckoutInput(1, 1400))).StatusCode);
        Assert.Equal("PICKED_UP", (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{paidToken}"))!.Status);
        Assert.Empty((await staff.GetFromJsonAsync<PassPage>("/api/staff/pass"))!.Items);

        // Not collected: OWNER only, after the kitchen finished, with an explicit confirmation.
        var noShowPath = $"/api/owner/sessions/{noShow.SessionId}/close-no-show";
        await AssertErrorAsync(await PostAsync(staff, noShowPath, new CloseNoShowInput(1, 1400, true)), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await PostAsync(owner, noShowPath, new CloseNoShowInput(1, 1400, true)), HttpStatusCode.Conflict, "ORDERS_PENDING");
        await kitchen.ReadyAsync(s.RestaurantId, noShow.Id, noShow.Items.Single().Id, default);
        await AssertErrorAsync(await PostAsync(owner, noShowPath, new CloseNoShowInput(1, 1400, false)), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        var closed = (await (await PostAsync(owner, noShowPath, new CloseNoShowInput(1, 1400, true))).Content.ReadFromJsonAsync<BillSummaryResponse>())!;
        Assert.Equal(("CLOSED", "NO_SHOW", 1400L), (closed.Status, closed.CloseReason, closed.TotalAmountCents));
        Assert.Equal("CLOSED", (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{noShowToken}"))!.Status);

        // Every dish cancelled: EMPTY and NO_SHOW are refused, VOIDED closes it.
        await kitchen.CancelAsync(s.RestaurantId, voided.Id, voided.Items.Single().Id, default);
        Assert.Equal("CANCELLED", (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{voidedToken}"))!.Status);
        await AssertErrorAsync(await PostAsync(staff, $"/api/staff/sessions/{voided.SessionId}/close-empty", new CloseZeroBillInput(2, 0, true)),
            HttpStatusCode.Conflict, "SESSION_HAS_ORDERS");
        await AssertErrorAsync(await PostAsync(owner, $"/api/owner/sessions/{voided.SessionId}/close-no-show", new CloseNoShowInput(2, 0, true)),
            HttpStatusCode.Conflict, "SESSION_NOT_PAYABLE");
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, $"/api/staff/sessions/{voided.SessionId}/close-void", new CloseZeroBillInput(2, 0, true))).StatusCode);
        Assert.Equal("CLOSED", (await guest.GetFromJsonAsync<PickupStatusResponse>($"/api/public/pickup-requests/{voidedToken}"))!.Status);

        // A table visit can never be closed as not collected.
        var table = new RestaurantTable { RestaurantId = s.RestaurantId, TableLabel = "5", QrToken = Guid.NewGuid().ToString("N") };
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();
        var dineIn = await new DiningService(db, host.Services.GetRequiredService<JoinCodes>(), host.Clock).OpenAsync(s.RestaurantId, table.Id, default);
        await AssertErrorAsync(await PostAsync(owner, $"/api/owner/sessions/{dineIn.Session.SessionId}/close-no-show", new CloseNoShowInput(1, 0, true)),
            HttpStatusCode.Conflict, "SESSION_NOT_PICKUP");
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, $"/api/staff/sessions/{dineIn.Session.SessionId}/close-empty", new CloseZeroBillInput(1, 0, true))).StatusCode);

        // History filters by channel; a table label only finds table visits.
        async Task<BillSummaryResponse[]> History(string query) =>
            (await owner.GetFromJsonAsync<HistoryPage>("/api/owner/history" + query))!.Items;
        Assert.Equal(4, (await History("")).Length);
        var pickups = await History("?channel=PICKUP");
        Assert.Equal(new[] { 3, 2, 1 }, pickups.Select(x => x.Pickup!.Number));
        Assert.Equal(new[] { "VOIDED", "NO_SHOW", "PAID" }, pickups.Select(x => x.CloseReason));
        Assert.Equal("EMPTY", Assert.Single(await History("?channel=DINE_IN")).CloseReason);
        Assert.Equal(noShow.SessionId, Assert.Single(await History("?closeReason=NO_SHOW")).SessionId);
        Assert.Equal(dineIn.Session.SessionId, Assert.Single(await History("?tableLabel=5")).SessionId);
        await AssertErrorAsync(await owner.GetAsync("/api/owner/history?channel=pickup"), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        var page = (await owner.GetFromJsonAsync<HistoryPage>("/api/owner/history?channel=PICKUP&limit=1"))!;
        await AssertErrorAsync(await owner.GetAsync($"/api/owner/history?channel=DINE_IN&limit=1&cursor={page.NextCursor}"),
            HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.Equal(2, (await owner.GetFromJsonAsync<HistoryPage>($"/api/owner/history?channel=PICKUP&limit=1&cursor={page.NextCursor}"))!.Items.Single().Pickup!.Number);
    }

    [Fact]
    public async Task DeleteRestaurant_WithPickupData_CascadesEveryPickupRow()
    {
        using var host = Host();
        var s = await SeedAsync();
        var (accepted, _) = await SubmitAsync(host, s);
        await SubmitAsync(host, s);
        await using var db = database.CreateContext();
        await new PickupDeskService(db, host.Clock).AcceptAsync(s.RestaurantId, accepted.Id, 15, default);
        await db.Restaurants.Where(r => r.Id == s.RestaurantId).ExecuteUpdateAsync(u => u.SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended));
        await new RestaurantAdministration(db, new PasswordHasher<RestaurantUser>(), NullLogger<RestaurantAdministration>.Instance,
                new SubscriptionService(db, host.Clock, NullLogger<SubscriptionService>.Instance), host.Clock)
            .DeleteAsync(s.RestaurantId, Guid.NewGuid(), default);
        Assert.False(await db.PickupHours.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.PickupCounters.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.PickupRequests.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.PickupRequestItems.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.DiningSessions.AnyAsync(x => x.RestaurantId == s.RestaurantId));
        Assert.False(await db.OrderItems.AnyAsync(x => x.RestaurantId == s.RestaurantId));
    }

    private AccountTestHost Host()
    {
        var host = new AccountTestHost(database);
        host.Clock.Set(Monday);
        return host;
    }

    private async Task<(PickupRequest Request, string Token)> SubmitAsync(AccountTestHost host, Setup s)
    {
        await using var db = database.CreateContext();
        var result = await new PickupOrderService(db, host.Clock).SubmitAsync(s.Slug,
            new(Guid.NewGuid(), "Marco", "+39 333 123 4567", [new(s.Item.Id, 2, 700, "少辣")]), default);
        return (await db.PickupRequests.AsNoTracking().SingleAsync(r => r.StatusToken == result.Response.StatusToken), result.Response.StatusToken);
    }

    private async Task<Setup> SeedAsync()
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "Pickup desk", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active,
            PickupEnabled = true, Phone = "0612345678", Slug = "d-" + Guid.NewGuid().ToString("N") };
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser { Restaurant = restaurant, Username = "desk." + Guid.NewGuid().ToString("N"),
                PasswordHash = "", Role = role, MustChangePassword = false };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
            return user;
        }
        var owner = User(RestaurantUserRole.Owner);
        var staff = User(RestaurantUserRole.Staff);
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "主食" };
        var item = new MenuItem { Restaurant = restaurant, Category = category, NameZh = "炒饭", PriceCents = 700, AllergenReviewed = true };
        db.RestaurantUsers.AddRange(owner, staff);
        db.MenuItems.Add(item);
        db.PickupHours.AddRange(Enumerable.Range(1, 7).Select(d =>
            new PickupHour { Restaurant = restaurant, Weekday = d, Slot = 1, OpensMinute = 0, ClosesMinute = 1440 }));
        await db.SaveChangesAsync();
        return new(restaurant.Id, restaurant.Slug, owner, staff, item);
    }

    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode);
        return client;
    }

    private ApplicationDbContext Intercepted(DbCommandInterceptor interceptor) => new(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseNpgsql(database.ConnectionString).AddInterceptors(interceptor).Options);

    // Holds the first transaction right after it locked a row of the given table.
    private sealed class Gate(string from, bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private bool Matches(DbCommand cmd) => cmd.CommandText.Contains(from, StringComparison.Ordinal) && cmd.CommandText.Contains("FOR ", StringComparison.Ordinal);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand cmd, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        { if (Matches(cmd)) Attempted.TrySetResult(); return ValueTask.FromResult(result); }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand cmd, CommandExecutedEventData data, DbDataReader result, CancellationToken ct = default)
        { if (Matches(cmd)) { Acquired.TrySetResult(); if (hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct); } return result; }
    }
}
