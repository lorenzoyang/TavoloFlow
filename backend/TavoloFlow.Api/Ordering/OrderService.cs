using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;

namespace TavoloFlow.Api.Ordering;

public sealed class OrderService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<OrderCreation> CreateAsync(GuestIdentity guest, CreateOrderInput input, CancellationToken ct)
    {
        if (input.SessionId is null || input.SessionId == Guid.Empty || input.ClientRequestId is null || input.ClientRequestId == Guid.Empty)
            throw OrderErrors.Invalid("sessionId", "请提供有效的用餐和请求标识。");
        RequireTarget(guest, input.SessionId.Value);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        
        // Menu writers and item deletion take restaurant UPDATE, so these SHARE locks keep prices and snapshots
        // stable without serializing orders from different tables.
        var (restaurant, table) = await DiningEntrance.LockAsync(db, guest.RestaurantId, guest.TableId, ct);
        var session = await LockSessionAsync(guest, RowLock.Update, ct);
        var original = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
        if (original is not null)
        {
            await transaction.CommitAsync(ct);
            return new(OrderResponse.From(original), false);
        }

        DiningEntrance.Require(restaurant, table);
        if (!restaurant.OrderingEnabled)
            throw new ApiException(409, "ORDERING_PAUSED", "餐厅暂未接受扫码订单。");
        var lines = OrderLines.Validate(input.Items);
        var (snapshots, total) = await OrderLines.BuildAsync(db, guest.RestaurantId, lines, ct);
        var existingTotal = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId &&
            o.DiningSessionId == guest.SessionId).SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        if (existingTotal > InputRules.MaxSafeCents - total || session.BillVersion == int.MaxValue)
            throw new ApiException(409, "BILL_LIMIT_REACHED", "本轮账单已达到支持的上限，请联系工作人员。");

        var order = new Order
        {
            Id = Guid.CreateVersion7(), RestaurantId = guest.RestaurantId, DiningSessionId = guest.SessionId,
            ClientRequestId = input.ClientRequestId.Value, TotalAmountCents = total,
            DefaultLanguageSnapshot = restaurant.DefaultLanguage, CreatedAt = clock.GetUtcNow().UtcDateTime
        };
        foreach (var line in snapshots) order.Items.Add(line.ToOrderItem(guest.RestaurantId));
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await db.DiningSessions.Where(s => s.Id == session.Id && s.RestaurantId == guest.RestaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        // Read PostgreSQL's timestamp precision, so pagination cursors and retry responses agree exactly.
        var saved = await Orders(guest).SingleAsync(o => o.Id == order.Id, ct);
        await transaction.CommitAsync(ct);
        return new(OrderResponse.From(saved), true);
    }

    public async Task<OrderResponse> ByRequestAsync(GuestIdentity guest, Guid sessionId, Guid requestId, CancellationToken ct)
    {
        RequireTarget(guest, sessionId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var order = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == requestId, ct)
            ?? throw new ApiException(404, "ORDER_NOT_FOUND", "暂未查到这次提交，请继续核对，或使用原请求重试。");
        var result = OrderResponse.From(order);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<OrderPage> ListAsync(GuestIdentity guest, Guid sessionId, string? cursor, int limit, CancellationToken ct)
    {
        RequireTarget(guest, sessionId);
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<OrderCursor>(cursor, c => c.SessionId == sessionId && Paging.IsPosition(c.CreatedAt, c.Id));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var query = Orders(guest);
        if (after is not null)
            query = query.Where(o => EF.Functions.LessThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.CreatedAt, after.Id)));
        var rows = await query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id).Take(limit + 1).ToArrayAsync(ct);
        var (page, next) = Paging.Page(rows, limit, last => new OrderCursor(sessionId, last.CreatedAt, last.Id));
        var total = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == sessionId).SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        await transaction.CommitAsync(ct);
        return new(page.Select(OrderResponse.From).ToArray(), next, total);
    }

    private IQueryable<Order> Orders(GuestIdentity guest) => db.Orders.AsNoTracking().Include(o => o.Items)
        .Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == guest.SessionId);

    private async Task<DiningSession> LockSessionAsync(GuestIdentity guest, RowLock mode, CancellationToken ct)
    {
        // Reading needs only the session lock: no later restaurant/table locks are acquired.
        var session = await RowLocks.SessionAsync(db, guest.RestaurantId, guest.SessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        if (session.TableId != guest.TableId) throw GuestErrors.SessionMismatch();
        return session;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target) throw GuestErrors.SessionMismatch();
    }

    private sealed record OrderCursor(Guid SessionId, DateTime CreatedAt, Guid Id);
}
