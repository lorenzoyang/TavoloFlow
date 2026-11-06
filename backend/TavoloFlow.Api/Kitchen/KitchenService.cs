using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

public sealed class KitchenService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<KitchenPage> ListAsync(
        Guid restaurantId,
        string status,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        if (!ApiEnum.TryParse(status, out OrderStatus state))
            throw OrderErrors.Invalid("status", "The order status must be NEW or PROCESSED.");
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<Cursor>(
            cursor,
            c =>
                c.RestaurantId == restaurantId
                && c.Status == status
                && Paging.IsPosition(c.At, c.Id)
        );
        // Rows and counters come from one snapshot.
        await using var tx = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var active = Orders(restaurantId)
            .Where(o => o.DiningSession.Status == DiningSessionStatus.Active);
        var filtered = active.Where(o => o.Status == state);
        var total = await filtered.LongCountAsync(ct);
        var pending = await active.LongCountAsync(o => o.Status == OrderStatus.New, ct);
        // Across both statuses and closed visits, so only a new submission raises it: processing and closing
        // never move it. A count would scan the whole history on every poll; each maximum reads one index end.
        var latestCreated = new[]
        {
            await LatestCreatedAsync(restaurantId, OrderStatus.New, ct),
            await LatestCreatedAsync(restaurantId, OrderStatus.Processed, ct),
        }.Max();
        if (after is not null)
        {
            filtered =
                state == OrderStatus.New
                    ? filtered.Where(o =>
                        EF.Functions.GreaterThan(
                            ValueTuple.Create(o.CreatedAt, o.Id),
                            ValueTuple.Create(after.At, after.Id)
                        )
                    )
                    : filtered.Where(o =>
                        EF.Functions.LessThan(
                            ValueTuple.Create(o.ProcessedAt!.Value, o.Id),
                            ValueTuple.Create(after.At, after.Id)
                        )
                    );
        }
        var sorted =
            state == OrderStatus.New
                ? filtered.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
                : filtered.OrderByDescending(o => o.ProcessedAt).ThenByDescending(o => o.Id);
        var rows = await sorted.Take(limit + 1).ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new Cursor(restaurantId, status, SortTime(last, state), last.Id)
        );
        await tx.CommitAsync(ct);
        return new(
            page.Select(KitchenOrderResponse.From).ToArray(),
            next,
            total,
            pending,
            latestCreated
        );
    }

    public async Task<KitchenOrderResponse> ReadAsync(
        Guid restaurantId,
        Guid id,
        CancellationToken ct
    )
    {
        var sessionId = await SessionIdAsync(restaurantId, id, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockActiveSessionAsync(restaurantId, sessionId, RowLock.Share, ct);
        var result = KitchenOrderResponse.From(await FindAsync(restaurantId, id, ct));
        await tx.CommitAsync(ct);
        return result;
    }

    public Task<KitchenOrderResponse> ReadyAsync(
        Guid restaurantId,
        Guid id,
        Guid itemId,
        CancellationToken ct
    ) => ChangeAsync(restaurantId, id, itemId, OrderItemStatus.Ready, ct);

    public Task<KitchenOrderResponse> CancelAsync(
        Guid restaurantId,
        Guid id,
        Guid itemId,
        CancellationToken ct
    ) => ChangeAsync(restaurantId, id, itemId, OrderItemStatus.Cancelled, ct);

    private async Task<KitchenOrderResponse> ChangeAsync(
        Guid restaurantId,
        Guid id,
        Guid itemId,
        OrderItemStatus to,
        CancellationToken ct
    )
    {
        // Resolve the tenant, order and item together, before revealing session state.
        var sessionId =
            await db
                .OrderItems.Where(i =>
                    i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId
                )
                .Select(i => (Guid?)i.Order.DiningSessionId)
                .SingleOrDefaultAsync(ct)
            ?? throw ItemMissing();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same session UPDATE lock as ordering/closure. Never acquire restaurant/table locks afterwards.
        var session = await LockActiveSessionAsync(restaurantId, sessionId, RowLock.Update, ct);
        var order = await FindAsync(restaurantId, id, ct);
        var item = order.Items.SingleOrDefault(i => i.Id == itemId) ?? throw ItemMissing();
        if (item.Status != OrderItemStatus.New)
            throw Changed();
        var cancelling = to == OrderItemStatus.Cancelled;
        if (cancelling && session.BillVersion == int.MaxValue)
            throw new ApiException(
                409,
                "BILL_LIMIT_REACHED",
                "The bill version has reached the supported limit. Contact the administrator."
            );
        var now = clock.GetUtcNow().UtcDateTime;
        if (now < order.CreatedAt)
            now = order.CreatedAt;
        var target = db.OrderItems.Where(i =>
            i.RestaurantId == restaurantId
            && i.OrderId == id
            && i.Id == itemId
            && i.Status == OrderItemStatus.New
        );
        var changed = cancelling
            ? await target.ExecuteUpdateAsync(
                u =>
                    u.SetProperty(i => i.Status, OrderItemStatus.Cancelled)
                        .SetProperty(i => i.CancelledAt, now),
                ct
            )
            : await target.ExecuteUpdateAsync(
                u =>
                    u.SetProperty(i => i.Status, OrderItemStatus.Ready)
                        .SetProperty(i => i.ReadyAt, now),
                ct
            );
        if (changed != 1)
            throw Changed();
        if (cancelling)
            await db
                .DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == session.Id)
                .ExecuteUpdateAsync(
                    u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1),
                    ct
                );
        var updated = await FindAsync(restaurantId, id, ct);
        if (updated.Items.All(i => i.Status != OrderItemStatus.New))
        {
            var processedAt = updated.Items.Max(i => (i.CancelledAt ?? i.ReadyAt)!.Value);
            await db
                .Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id)
                .ExecuteUpdateAsync(
                    u =>
                        u.SetProperty(o => o.Status, OrderStatus.Processed)
                            .SetProperty(o => o.ProcessedAt, processedAt),
                    ct
                );
            updated.Status = OrderStatus.Processed;
            updated.ProcessedAt = processedAt;
        }
        var result = KitchenOrderResponse.From(updated);
        await tx.CommitAsync(ct);
        return result;
    }

    // READY items not yet taken from the pass, oldest first. Closure marks a visit's remaining items served.
    public async Task<PassPage> PassAsync(
        Guid restaurantId,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<PassCursor>(
            cursor,
            c => c.RestaurantId == restaurantId && Paging.IsPosition(c.At, c.Id)
        );
        await using var tx = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var waiting = db
            .OrderItems.AsNoTracking()
            .Where(i =>
                i.RestaurantId == restaurantId
                && i.Status == OrderItemStatus.Ready
                && i.ServedAt == null
            );
        var latest = await waiting.MaxAsync(i => i.ReadyAt, ct);
        var active = waiting.Where(i => i.Order.DiningSession.Status == DiningSessionStatus.Active);
        var total = await active.LongCountAsync(ct);
        if (after is not null)
            active = active.Where(i =>
                EF.Functions.GreaterThan(
                    ValueTuple.Create(i.ReadyAt!.Value, i.Id),
                    ValueTuple.Create(after.At, after.Id)
                )
            );
        var rows = await active
            .Include(i => i.Order)
                .ThenInclude(o => o.DiningSession)
            .OrderBy(i => i.ReadyAt)
            .ThenBy(i => i.Id)
            .Take(limit + 1)
            .ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new PassCursor(restaurantId, last.ReadyAt!.Value, last.Id)
        );
        await tx.CommitAsync(ct);
        return new(page.Select(PassItemResponse.From).ToArray(), next, total, latest);
    }

    public async Task<PassItemResponse> ServedAsync(
        Guid restaurantId,
        Guid id,
        Guid itemId,
        CancellationToken ct
    )
    {
        var sessionId =
            await db
                .OrderItems.Where(i =>
                    i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId
                )
                .Select(i => (Guid?)i.Order.DiningSessionId)
                .SingleOrDefaultAsync(ct)
            ?? throw ItemMissing();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same session lock as the kitchen transitions, so a closure cannot interleave.
        await LockActiveSessionAsync(restaurantId, sessionId, RowLock.Update, ct);
        var target = db.OrderItems.Where(i =>
            i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId
        );
        var item = await target.AsNoTracking().SingleOrDefaultAsync(ct) ?? throw ItemMissing();
        if (item.Status != OrderItemStatus.Ready || item.ServedAt is not null)
            throw Changed();
        var now = clock.GetUtcNow().UtcDateTime;
        if (now < item.ReadyAt)
            now = item.ReadyAt!.Value;
        var changed = await target
            .Where(i => i.Status == OrderItemStatus.Ready && i.ServedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(i => i.ServedAt, now), ct);
        if (changed != 1)
            throw Changed();
        var result = PassItemResponse.From(
            await target
                .AsNoTracking()
                .Include(i => i.Order)
                    .ThenInclude(o => o.DiningSession)
                .SingleAsync(ct)
        );
        await tx.CommitAsync(ct);
        return result;
    }

    private Task<DateTime?> LatestCreatedAsync(
        Guid restaurantId,
        OrderStatus status,
        CancellationToken ct
    ) =>
        db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.Status == status)
            .MaxAsync(o => (DateTime?)o.CreatedAt, ct);

    private IQueryable<Order> Orders(Guid restaurantId) =>
        db
            .Orders.AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.DiningSession)
            .Where(o => o.RestaurantId == restaurantId);

    private async Task<Order> FindAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await Orders(restaurantId).SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw Missing();

    // An order never moves to another session, so its session can be resolved before the transaction.
    private async Task<Guid> SessionIdAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id)
            .Select(o => (Guid?)o.DiningSessionId)
            .SingleOrDefaultAsync(ct)
        ?? throw Missing();

    private async Task<DiningSession> LockActiveSessionAsync(
        Guid restaurantId,
        Guid sessionId,
        RowLock mode,
        CancellationToken ct
    )
    {
        var session =
            await RowLocks.SessionAsync(db, restaurantId, sessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active)
            throw DiningErrors.SessionClosed();
        return session;
    }

    private static ApiException Missing() =>
        new(404, "ORDER_NOT_FOUND", "The order doesn't exist.");

    private static ApiException ItemMissing() =>
        new(404, "ORDER_ITEM_NOT_FOUND", "The ordered dish doesn't exist.");

    private static ApiException Changed() =>
        new(409, "ORDER_ITEM_CHANGED", "The dish status has changed. Reload and check.");

    private static DateTime SortTime(Order order, OrderStatus status) =>
        status == OrderStatus.New ? order.CreatedAt : order.ProcessedAt!.Value;

    private sealed record Cursor(Guid RestaurantId, string Status, DateTime At, Guid Id);

    private sealed record PassCursor(Guid RestaurantId, DateTime At, Guid Id);
}
