using System.Data.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineConcurrencyTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    // Monday 23:59 in Rome, then Tuesday 00:00. The shop closes at midnight in the retry test.
    private static readonly DateTimeOffset BeforeMidnight = new(
        2026,
        11,
        16,
        22,
        59,
        0,
        TimeSpan.Zero
    );

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Submit_CrossMidnightRetry_WaitsForOriginalOutcome(bool commitOriginal)
    {
        var clock = new TestClock();
        clock.Set(BeforeMidnight);
        var shop = await OnlineTestData.SeedShopAsync(database);
        await MidnightHoursAsync(shop, tuesdayOpen: false);
        var body = Submission(shop);
        var originalGate = new CommandGate("INSERT INTO online_counters", hold: true);
        var retryGate = new CommandGate("pg_advisory_xact_lock", hold: false);
        await using var originalDb = OnlineTestData.Intercepted(database, originalGate);
        await using var retryDb = OnlineTestData.Intercepted(database, retryGate);
        var original = new OnlineRequestService(
            originalDb,
            clock,
            OnlineTestData.NoPush,
            OnlineTestData.SubmissionLimits
        ).SubmitAsync(shop.Slug, body, OnlineTestData.Source(), default);
        Task<OnlineSubmission>? retry = null;
        try
        {
            await originalGate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            clock.Set(BeforeMidnight.AddMinutes(1));
            retry = new OnlineRequestService(
                retryDb,
                clock,
                OnlineTestData.NoPush,
                OnlineTestData.SubmissionLimits
            ).SubmitAsync(shop.Slug, body, OnlineTestData.Source(), default);
            await retryGate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(retry.IsCompleted);
            Assert.False(retryGate.Acquired.Task.IsCompleted);
        }
        finally
        {
            if (commitOriginal)
                originalGate.Release.TrySetResult();
            else
                originalGate.Release.TrySetException(
                    new InvalidOperationException("Test rollback.")
                );
        }

        if (commitOriginal)
        {
            var first = await original;
            var repeated = await retry!;
            Assert.True(first.Created);
            Assert.False(repeated.Created);
            Assert.Equal(first.Response, repeated.Response);
        }
        else
        {
            await Assert.ThrowsAsync<InvalidOperationException>(async () => await original);
            var error = await Assert.ThrowsAsync<ApiException>(async () => await retry!);
            Assert.Equal("ONLINE_CLOSED", error.Code);
        }
        await using var check = database.CreateContext();
        Assert.Equal(
            commitOriginal ? 1 : 0,
            await check.OnlineRequests.CountAsync(r => r.RestaurantId == shop.RestaurantId)
        );
        var counters = await check
            .OnlineCounters.Where(c => c.RestaurantId == shop.RestaurantId)
            .ToArrayAsync();
        if (commitOriginal)
        {
            var counter = Assert.Single(counters);
            Assert.Equal(new DateOnly(2026, 11, 16), counter.BusinessDate);
            Assert.Equal(1, counter.LastNumber);
        }
        else
            Assert.Empty(counters);
    }

    [Fact]
    public async Task Submit_CrossMidnightCap_SerializesOneRestaurantOnly()
    {
        var clock = new TestClock();
        clock.Set(BeforeMidnight);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var other = await OnlineTestData.SeedShopAsync(database);
        await MidnightHoursAsync(shop, tuesdayOpen: true);
        await using (var db = database.CreateContext())
        {
            db.AddRange(
                Enumerable
                    .Range(100, 19)
                    .Select(number =>
                        OnlineTestData.Request(
                            shop.RestaurantId,
                            BeforeMidnight.AddMinutes(-1).UtcDateTime,
                            number
                        )
                    )
            );
            await db.SaveChangesAsync();
        }
        var gate = new CommandGate("INSERT INTO online_counters", hold: true);
        var waiting = new CommandGate("pg_advisory_xact_lock", hold: false);
        await using var firstDb = OnlineTestData.Intercepted(database, gate);
        await using var nextDb = OnlineTestData.Intercepted(database, waiting);
        var first = new OnlineRequestService(
            firstDb,
            clock,
            OnlineTestData.NoPush,
            OnlineTestData.SubmissionLimits
        ).SubmitAsync(shop.Slug, Submission(shop), OnlineTestData.Source(), default);
        Task<OnlineSubmission>? next = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            clock.Set(BeforeMidnight.AddMinutes(1));
            next = new OnlineRequestService(
                nextDb,
                clock,
                OnlineTestData.NoPush,
                OnlineTestData.SubmissionLimits
            ).SubmitAsync(shop.Slug, Submission(shop), OnlineTestData.Source(), default);
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(next.IsCompleted);
            // A different restaurant does not queue behind this one's submission lock.
            await using var otherDb = database.CreateContext();
            Assert.True(
                (
                    await new OnlineRequestService(
                        otherDb,
                        clock,
                        OnlineTestData.NoPush,
                        OnlineTestData.SubmissionLimits
                    )
                        .SubmitAsync(
                            other.Slug,
                            Submission(other),
                            OnlineTestData.Source(),
                            default
                        )
                        .WaitAsync(TimeSpan.FromSeconds(10))
                ).Created
            );
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        Assert.True((await first).Created);
        var error = await Assert.ThrowsAsync<ApiException>(async () => await next!);
        Assert.Equal("ONLINE_BUSY", error.Code);
        await using var check = database.CreateContext();
        Assert.Equal(
            20,
            await check
                .OnlineRequests.Waiting(shop.RestaurantId, clock.GetUtcNow().UtcDateTime)
                .CountAsync()
        );
        Assert.Single(
            await check
                .OnlineCounters.Where(c => c.RestaurantId == shop.RestaurantId)
                .ToArrayAsync()
        );
    }

    [Fact]
    public async Task Reject_WaitsPastExpiry_KeepsTheRequestExpired()
    {
        var clock = new TestClock();
        clock.Set(Noon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var request = OnlineTestData.Request(
            shop.RestaurantId,
            Noon.AddMinutes(-10).AddSeconds(1).UtcDateTime,
            1
        );
        await using (var seed = database.CreateContext())
        {
            seed.Add(request);
            await seed.SaveChangesAsync();
        }
        await using var lockDb = database.CreateContext();
        await using var held = await lockDb.Database.BeginTransactionAsync();
        await RowLocks.OnlineRequestAsync(
            lockDb,
            shop.RestaurantId,
            request.Id,
            RowLock.Update,
            default
        );
        var gate = new CommandGate("FROM online_requests ", hold: false);
        await using var rejectDb = OnlineTestData.Intercepted(database, gate);
        var rejecting = new OnlineStaffService(rejectDb, clock).RejectAsync(
            shop.RestaurantId,
            request.Id,
            new(null),
            default
        );
        try
        {
            await gate.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(rejecting.IsCompleted);
            clock.Advance(TimeSpan.FromSeconds(1));
            await using var statusDb = database.CreateContext();
            Assert.Equal(
                "EXPIRED",
                (
                    await new OnlineOrderStatusService(statusDb, clock).ReadAsync(
                        request.StatusToken,
                        default
                    )
                ).Phase
            );
        }
        finally
        {
            await held.RollbackAsync();
        }
        var error = await Assert.ThrowsAsync<ApiException>(async () => await rejecting);
        Assert.Equal("ONLINE_REQUEST_CHANGED", error.Code);
        await using var check = database.CreateContext();
        var stored = await check.OnlineRequests.SingleAsync(r => r.Id == request.Id);
        Assert.Null(stored.RejectedAt);
        Assert.Equal(
            OnlineRequestPhase.Expired,
            OnlineRequestState.Phase(stored, clock.GetUtcNow().UtcDateTime)
        );
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Accept_RacingServicesSwitch_OpenWorkKeepsOnlineEnabled(bool acceptFirst)
    {
        var clock = new TestClock();
        clock.Set(Noon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var request = await SeedRequestAsync(shop, Noon);
        var gate = new OnlineLockGate(acceptFirst ? "FOR SHARE" : "FOR UPDATE", hold: true);
        var waiting = new OnlineLockGate(acceptFirst ? "FOR UPDATE" : "FOR SHARE", hold: false);
        await using var firstDb = OnlineTestData.Intercepted(database, gate);
        await using var secondDb = OnlineTestData.Intercepted(database, waiting);
        async Task<object> Accept() =>
            await new OnlineStaffService(acceptFirst ? firstDb : secondDb, clock).AcceptAsync(
                shop.RestaurantId,
                request.Id,
                new(10),
                default
            );
        async Task<object> TurnOff() =>
            await Administration(acceptFirst ? secondDb : firstDb, clock)
                .SetServicesAsync(shop.RestaurantId, new(true, false), Guid.NewGuid(), default);
        var first = acceptFirst ? Accept() : TurnOff();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = acceptFirst ? TurnOff() : Accept();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(second.IsCompleted);
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        var failed = acceptFirst ? second! : first;
        var accepted = acceptFirst ? first : second!;
        var error = await Assert.ThrowsAsync<ApiException>(async () => await failed);
        Assert.Equal("SERVICE_HAS_OPEN_WORK", error.Code);
        await accepted;
        await using var check = database.CreateContext();
        Assert.True(
            (await check.Restaurants.SingleAsync(r => r.Id == shop.RestaurantId)).OnlineEnabled
        );
        Assert.NotNull(
            (await check.OnlineRequests.SingleAsync(r => r.Id == request.Id)).AcceptedAt
        );
        Assert.Single(
            await check
                .DiningSessions.Where(s => s.RestaurantId == shop.RestaurantId)
                .ToArrayAsync()
        );
        Assert.Single(
            await check.Orders.Where(o => o.RestaurantId == shop.RestaurantId).ToArrayAsync()
        );
    }

    [Fact]
    public async Task Accept_WaitsForServicesSwitchPastExpiry_CreatesNoWork()
    {
        var clock = new TestClock();
        clock.Set(Noon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var request = await SeedRequestAsync(shop, Noon.AddMinutes(-10).AddSeconds(1));
        var gate = new OnlineLockGate("FOR UPDATE", hold: true);
        var waiting = new OnlineLockGate("FOR SHARE", hold: false);
        await using var platformDb = OnlineTestData.Intercepted(database, gate);
        await using var acceptDb = OnlineTestData.Intercepted(database, waiting);
        var switching = Administration(platformDb, clock)
            .SetServicesAsync(shop.RestaurantId, new(true, false), Guid.NewGuid(), default);
        Task<OnlineActiveOrderResponse>? accepting = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            accepting = new OnlineStaffService(acceptDb, clock).AcceptAsync(
                shop.RestaurantId,
                request.Id,
                new(10),
                default
            );
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(accepting.IsCompleted);
            clock.Advance(TimeSpan.FromSeconds(1));
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        await switching;
        var error = await Assert.ThrowsAsync<ApiException>(async () => await accepting!);
        Assert.Equal("ONLINE_REQUEST_CHANGED", error.Code);
        await using var check = database.CreateContext();
        Assert.False(
            (await check.Restaurants.SingleAsync(r => r.Id == shop.RestaurantId)).OnlineEnabled
        );
        Assert.Null((await check.OnlineRequests.SingleAsync(r => r.Id == request.Id)).AcceptedAt);
        Assert.False(await check.DiningSessions.AnyAsync(s => s.RestaurantId == shop.RestaurantId));
        Assert.False(await check.Orders.AnyAsync(o => o.RestaurantId == shop.RestaurantId));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Accept_RacingSuspension_OnlyEarlierAcceptanceCreatesWork(bool acceptFirst)
    {
        var clock = new TestClock();
        clock.Set(Noon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var request = await SeedRequestAsync(shop, Noon);
        var gate = new OnlineLockGate(acceptFirst ? "FOR SHARE" : "FOR UPDATE", hold: true);
        var waiting = new OnlineLockGate(acceptFirst ? "FOR UPDATE" : "FOR SHARE", hold: false);
        await using var firstDb = OnlineTestData.Intercepted(database, gate);
        await using var secondDb = OnlineTestData.Intercepted(database, waiting);
        async Task<object> Accept() =>
            await new OnlineStaffService(acceptFirst ? firstDb : secondDb, clock).AcceptAsync(
                shop.RestaurantId,
                request.Id,
                new(10),
                default
            );
        async Task<object> Suspend() =>
            await Administration(acceptFirst ? secondDb : firstDb, clock)
                .SetStatusAsync(shop.RestaurantId, "SUSPENDED", Guid.NewGuid(), default);
        var first = acceptFirst ? Accept() : Suspend();
        Task<object>? second = null;
        try
        {
            await gate.Acquired.Task.WaitAsync(TimeSpan.FromSeconds(10));
            second = acceptFirst ? Suspend() : Accept();
            await waiting.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(second.IsCompleted);
        }
        finally
        {
            gate.Release.TrySetResult();
        }
        await first;
        if (acceptFirst)
            await second!;
        else
        {
            var error = await Assert.ThrowsAsync<ApiException>(async () => await second!);
            Assert.Equal("SERVICE_SUSPENDED", error.Code);
        }
        await using var check = database.CreateContext();
        Assert.Equal(
            RestaurantServiceStatus.Suspended,
            (await check.Restaurants.SingleAsync(r => r.Id == shop.RestaurantId)).ServiceStatus
        );
        Assert.Equal(
            acceptFirst,
            (await check.OnlineRequests.SingleAsync(r => r.Id == request.Id)).AcceptedAt is not null
        );
        Assert.Equal(
            acceptFirst ? 1 : 0,
            await check.DiningSessions.CountAsync(s => s.RestaurantId == shop.RestaurantId)
        );
        Assert.Equal(
            acceptFirst ? 1 : 0,
            await check.Orders.CountAsync(o => o.RestaurantId == shop.RestaurantId)
        );
        if (!acceptFirst)
        {
            // Suspension still permits staff to refuse the waiting request.
            await new OnlineStaffService(check, clock).RejectAsync(
                shop.RestaurantId,
                request.Id,
                new(null),
                default
            );
            Assert.NotNull(
                (
                    await check.OnlineRequests.AsNoTracking().SingleAsync(r => r.Id == request.Id)
                ).RejectedAt
            );
        }
    }

    private async Task<OnlineRequest> SeedRequestAsync(OnlineShop shop, DateTimeOffset submitted)
    {
        var request = OnlineTestData.Request(
            shop.RestaurantId,
            submitted.UtcDateTime,
            1,
            shop.Dish.Id
        );
        await using var db = database.CreateContext();
        db.Add(request);
        await db.SaveChangesAsync();
        return request;
    }

    private async Task MidnightHoursAsync(OnlineShop shop, bool tuesdayOpen)
    {
        await using var db = database.CreateContext();
        await db.OnlineHours.Where(h => h.RestaurantId == shop.RestaurantId).ExecuteDeleteAsync();
        db.Add(
            new OnlineHour
            {
                RestaurantId = shop.RestaurantId,
                Weekday = 1,
                Slot = 1,
                OpensMinute = 0,
                ClosesMinute = 1440,
            }
        );
        if (tuesdayOpen)
            db.Add(
                new OnlineHour
                {
                    RestaurantId = shop.RestaurantId,
                    Weekday = 2,
                    Slot = 1,
                    OpensMinute = 0,
                    ClosesMinute = 1440,
                }
            );
        await db.SaveChangesAsync();
    }

    private static OnlineRequestInput Submission(OnlineShop shop) =>
        new(
            Guid.NewGuid(),
            "PICKUP",
            "Marco",
            "3331234567",
            null,
            null,
            [new OrderLineInput(shop.Dish.Id, 1, 1200, null, [])],
            null
        );

    private static RestaurantAdministration Administration(
        ApplicationDbContext db,
        TimeProvider clock
    ) =>
        new(
            db,
            new PasswordHasher<RestaurantUser>(),
            NullLogger<RestaurantAdministration>.Instance,
            new SubscriptionService(db, clock, NullLogger<SubscriptionService>.Instance),
            clock
        );

    // A precise gate at an SQL command, including the advisory lock (a non-query) and counter (a reader).
    private sealed class CommandGate(string fragment, bool hold) : DbCommandInterceptor
    {
        public TaskCompletionSource Attempted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Acquired { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        private bool Matches(DbCommand command) =>
            command.CommandText.Contains(fragment, StringComparison.Ordinal);

        private async Task AcquiredAsync(DbCommand command, CancellationToken ct)
        {
            if (!Matches(command))
                return;
            Acquired.TrySetResult();
            if (hold)
                await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
        }

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken ct = default
        )
        {
            if (Matches(command))
                Attempted.TrySetResult();
            return ValueTask.FromResult(result);
        }

        public override async ValueTask<int> NonQueryExecutedAsync(
            DbCommand command,
            CommandExecutedEventData eventData,
            int result,
            CancellationToken ct = default
        )
        {
            await AcquiredAsync(command, ct);
            return result;
        }

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
            await AcquiredAsync(command, ct);
            return result;
        }
    }
}
