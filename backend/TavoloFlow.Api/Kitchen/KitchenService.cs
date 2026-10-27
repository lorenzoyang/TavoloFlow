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
    public async Task<KitchenPage> ListAsync(Guid restaurantId, string status, string? cursor, int limit, CancellationToken ct)
    {
        if (!ApiEnum.TryParse(status, out OrderStatus state))
            throw OrderErrors.Invalid("status", "订单状态须为 NEW 或 PROCESSED。");
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<Cursor>(cursor, c =>
            c.RestaurantId == restaurantId && c.Status == status && Paging.IsPosition(c.At, c.Id));
        // Rows and counters come from one snapshot.
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var active = Orders(restaurantId).Where(o => o.DiningSession.Status == DiningSessionStatus.Active);
        var filtered = active.Where(o => o.Status == state);
        var total = await filtered.LongCountAsync(ct);
        var pending = await active.LongCountAsync(o => o.Status == OrderStatus.New, ct);
        // Includes closed/cancelled orders: processing and closing must not look like new submissions.
        var created = await db.Orders.LongCountAsync(o => o.RestaurantId == restaurantId, ct);
        if (after is not null)
        {
            filtered = state == OrderStatus.New
                ? filtered.Where(o => EF.Functions.GreaterThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.At, after.Id)))
                : filtered.Where(o => EF.Functions.LessThan(ValueTuple.Create(o.ProcessedAt!.Value, o.Id), ValueTuple.Create(after.At, after.Id)));
        }
        var sorted = state == OrderStatus.New
            ? filtered.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
            : filtered.OrderByDescending(o => o.ProcessedAt).ThenByDescending(o => o.Id);
        var rows = await sorted.Take(limit + 1).ToArrayAsync(ct);
        var (page, next) = Paging.Page(rows, limit, last => new Cursor(restaurantId, status, SortTime(last, state), last.Id));
        await tx.CommitAsync(ct);
        return new(page.Select(KitchenOrderResponse.From).ToArray(), next, total, pending, created);
    }

    public async Task<KitchenOrderResponse> ReadAsync(Guid restaurantId, Guid id, CancellationToken ct)
    {
        var sessionId = await SessionIdAsync(restaurantId, id, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockActiveSessionAsync(restaurantId, sessionId, RowLock.Share, ct);
        var result = KitchenOrderResponse.From(await FindAsync(restaurantId, id, ct));
        await tx.CommitAsync(ct);
        return result;
    }

    public Task<KitchenOrderResponse> ReadyAsync(Guid restaurantId, Guid id, Guid itemId, CancellationToken ct) =>
        ChangeAsync(restaurantId, id, itemId, OrderItemStatus.Ready, ct);

    public Task<KitchenOrderResponse> CancelAsync(Guid restaurantId, Guid id, Guid itemId, CancellationToken ct) =>
        ChangeAsync(restaurantId, id, itemId, OrderItemStatus.Cancelled, ct);

    private async Task<KitchenOrderResponse> ChangeAsync(Guid restaurantId, Guid id, Guid itemId,
        OrderItemStatus to, CancellationToken ct)
    {
        // Resolve the tenant, order and item together, before revealing session state.
        var sessionId = await db.OrderItems.Where(i => i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId)
            .Select(i => (Guid?)i.Order.DiningSessionId).SingleOrDefaultAsync(ct) ?? throw ItemMissing();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same session UPDATE lock as ordering/closure. Never acquire restaurant/table locks afterwards.
        var session = await LockActiveSessionAsync(restaurantId, sessionId, RowLock.Update, ct);
        var order = await FindAsync(restaurantId, id, ct);
        var item = order.Items.SingleOrDefault(i => i.Id == itemId) ?? throw ItemMissing();
        if (item.Status != OrderItemStatus.New) throw Changed();
        var cancelling = to == OrderItemStatus.Cancelled;
        if (cancelling && session.BillVersion == int.MaxValue)
            throw new ApiException(409, "BILL_LIMIT_REACHED", "本轮账单版本已达到支持的上限，请联系管理员。");
        var now = clock.GetUtcNow().UtcDateTime;
        if (now < order.CreatedAt) now = order.CreatedAt;
        var target = db.OrderItems.Where(i => i.RestaurantId == restaurantId && i.OrderId == id &&
            i.Id == itemId && i.Status == OrderItemStatus.New);
        var changed = cancelling
            ? await target.ExecuteUpdateAsync(u => u.SetProperty(i => i.Status, OrderItemStatus.Cancelled)
                .SetProperty(i => i.CancelledAt, now), ct)
            : await target.ExecuteUpdateAsync(u => u.SetProperty(i => i.Status, OrderItemStatus.Ready)
                .SetProperty(i => i.ReadyAt, now), ct);
        if (changed != 1) throw Changed();
        if (cancelling)
            await db.DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == session.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        var updated = await FindAsync(restaurantId, id, ct);
        if (updated.Items.All(i => i.Status != OrderItemStatus.New))
        {
            var processedAt = updated.Items.Max(i => (i.CancelledAt ?? i.ReadyAt)!.Value);
            await db.Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id)
                .ExecuteUpdateAsync(u => u.SetProperty(o => o.Status, OrderStatus.Processed)
                    .SetProperty(o => o.ProcessedAt, processedAt), ct);
            updated.Status = OrderStatus.Processed;
            updated.ProcessedAt = processedAt;
        }
        var result = KitchenOrderResponse.From(updated);
        await tx.CommitAsync(ct);
        return result;
    }

    private IQueryable<Order> Orders(Guid restaurantId) => db.Orders.AsNoTracking()
        .Include(o => o.Items).Include(o => o.DiningSession).Where(o => o.RestaurantId == restaurantId);

    private async Task<Order> FindAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await Orders(restaurantId).SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw Missing();

    // An order never moves to another session, so its session can be resolved before the transaction.
    private async Task<Guid> SessionIdAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await db.Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id)
            .Select(o => (Guid?)o.DiningSessionId).SingleOrDefaultAsync(ct) ?? throw Missing();

    private async Task<DiningSession> LockActiveSessionAsync(Guid restaurantId, Guid sessionId, RowLock mode, CancellationToken ct)
    {
        var session = await RowLocks.SessionAsync(db, restaurantId, sessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        return session;
    }

    private static ApiException Missing() => new(404, "ORDER_NOT_FOUND", "订单不存在。");
    private static ApiException ItemMissing() => new(404, "ORDER_ITEM_NOT_FOUND", "订单菜品不存在。");
    private static ApiException Changed() => new(409, "ORDER_ITEM_CHANGED", "菜品状态已变化，请重新读取并确认。");

    private static DateTime SortTime(Order order, OrderStatus status) =>
        status == OrderStatus.New ? order.CreatedAt : order.ProcessedAt!.Value;

    private sealed record Cursor(Guid RestaurantId, string Status, DateTime At, Guid Id);
}
