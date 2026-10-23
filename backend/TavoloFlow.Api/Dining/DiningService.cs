using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

public sealed class DiningService(ApplicationDbContext db, JoinCodes codes, TimeProvider clock)
{
    public async Task<AcceptingOrdersResponse> SetAcceptingOrdersAsync(Guid restaurantId, bool enabled, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await db.Restaurants.FromSqlInterpolated($"SELECT * FROM restaurants WHERE id = {restaurantId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw DiningErrors.RestaurantNotFound();
        if (enabled && restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            throw new ApiException(409, "SERVICE_SUSPENDED", "餐厅服务已暂停，无法开启接单。");
        restaurant.OrderingEnabled = enabled;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(enabled);
    }

    public async Task<FloorResponse> FloorAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var restaurant = await db.Restaurants.AsNoTracking().SingleAsync(x => x.Id == restaurantId, ct);
        var tables = await db.RestaurantTables.AsNoTracking().Where(x => x.RestaurantId == restaurantId).OrderBy(x => x.Id)
            .Select(x => new FloorTableResponse(x.Id, x.TableLabel, x.IsEnabled,
                x.DiningSessions.Where(s => s.Status == DiningSessionStatus.Active)
                    .Select(s => new ActiveSessionResponse(s.Id, s.OpenedAt, s.Orders.Count,
                        s.Orders.Count(o => o.Status == OrderStatus.New),
                        s.Orders.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.TotalAmountCents)))
                    .SingleOrDefault())).ToArrayAsync(ct);
        await transaction.CommitAsync(ct);
        return new(restaurant.ServiceStatus.ToString().ToUpperInvariant(), restaurant.OrderingEnabled, tables);
    }

    public async Task<SessionResponse> ReadAsync(Guid restaurantId, Guid sessionId, CancellationToken ct) =>
        await db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId && s.Id == sessionId)
            .Select(s => new SessionResponse(s.Id, s.TableId, s.TableLabelSnapshot,
                s.Status == DiningSessionStatus.Active ? "ACTIVE" : "CLOSED", s.OpenedAt, s.ClosedAt,
                s.CloseReason == null ? null : s.CloseReason == SessionCloseReason.Empty ? "EMPTY" : s.CloseReason == SessionCloseReason.Paid ? "PAID" : "VOIDED",
                s.BillVersion, s.Orders.Count,
                s.ClosedTotalCents ?? s.Orders.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.TotalAmountCents)))
            .SingleOrDefaultAsync(ct) ?? throw DiningErrors.SessionNotFound();

    public async Task<OpenSessionResponse> OpenAsync(Guid restaurantId, Guid tableId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        
        var restaurant = await DiningLocks.RestaurantAsync(db, restaurantId, ct);
        var table = await DiningLocks.TableAsync(db, restaurantId, tableId, true, ct);
        DiningLocks.RequireEntrance(restaurant, table);
        if (await db.DiningSessions.AnyAsync(s => s.RestaurantId == restaurantId && s.TableId == tableId &&
            s.Status == DiningSessionStatus.Active, ct))
            throw new ApiException(409, "SESSION_ALREADY_ACTIVE", "此桌已开桌，请重新读取当前用餐状态。");

        var session = new DiningSession
        {
            Id = Guid.CreateVersion7(), RestaurantId = restaurantId, TableId = tableId,
            TableLabelSnapshot = table.TableLabel, OpenedAt = clock.GetUtcNow().UtcDateTime
        };
        var code = codes.Generate();
        session.JoinCodeCiphertext = codes.Encrypt(session, code);
        db.DiningSessions.Add(session);
        await db.SaveChangesAsync(ct);
        var response = await ReadAsync(restaurantId, session.Id, ct);
        await transaction.CommitAsync(ct);
        return new(response, code);
    }

    public async Task<JoinCodeResponse> ReadCodeAsync(Guid restaurantId, Guid sessionId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var session = await DiningLocks.SessionAsync(db, restaurantId, sessionId, false, ct);
        var result = new JoinCodeResponse(session.Id, codes.Read(session));
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<SessionResponse> CloseEmptyAsync(Guid restaurantId, Guid id, CloseEmptyInput input, CancellationToken ct)
    {
        if (input.GuestsLeftConfirmed != true || input.ConfirmedTotalCents != 0 || input.ExpectedBillVersion is null or <= 0)
            throw ApiException.Validation("请核对零账单并确认顾客已离桌。");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Ordering, kitchen transitions and checkout take this same session lock.
        var session = await DiningLocks.SessionAsync(db, restaurantId, id, true, ct);
        if (session.BillVersion != input.ExpectedBillVersion)
            throw new ApiException(409, "BILL_CHANGED", "账单已变化，请重新核对。");
        if (session.Status == DiningSessionStatus.Closed)
        {
            if (session.CloseReason != SessionCloseReason.Empty || session.ClosedTotalCents != 0)
                throw DiningErrors.SessionClosed();
        }
        else
        {
            if (await db.Orders.AnyAsync(o => o.RestaurantId == restaurantId && o.DiningSessionId == id, ct))
                throw new ApiException(409, "SESSION_HAS_ORDERS", "本轮曾产生订单，不能按空桌关闭。");
            var now = clock.GetUtcNow().UtcDateTime;
            if (now < session.OpenedAt) now = session.OpenedAt;
            await db.DiningSessions.Where(s => s.Id == id && s.RestaurantId == restaurantId)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(s => s.Status, DiningSessionStatus.Closed)
                    .SetProperty(s => s.CloseReason, SessionCloseReason.Empty)
                    .SetProperty(s => s.ClosedAt, now)
                    .SetProperty(s => s.ClosedTotalCents, 0L)
                    .SetProperty(s => s.JoinCodeCiphertext, (string?)null), ct);
        }
        var result = await ReadAsync(restaurantId, id, ct);
        await transaction.CommitAsync(ct);
        return result;
    }
}
