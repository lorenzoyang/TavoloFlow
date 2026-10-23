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
        // UPDATE waits for the restaurant SHARE lock that every order creation holds, so no order slips past a pause.
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        if (enabled && restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            throw new ApiException(409, "SERVICE_SUSPENDED", "餐厅服务已暂停，无法开启接单。");
        await db.Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(update => update.SetProperty(r => r.OrderingEnabled, enabled), ct);
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
        return new(ApiEnum.Text(restaurant.ServiceStatus), restaurant.OrderingEnabled, tables);
    }

    public Task<BillSummaryResponse> ReadAsync(Guid restaurantId, Guid sessionId, CancellationToken ct) =>
        SessionSummaries.ReadAsync(db, restaurantId, sessionId, ct);

    public async Task<OpenSessionResponse> OpenAsync(Guid restaurantId, Guid tableId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Table UPDATE serializes opening with table maintenance and deletion. The partial unique index
        // uq_active_session_per_table stays the final guarantee of one ACTIVE session per table.
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        var table = await RowLocks.TableAsync(db, restaurantId, tableId, RowLock.Update, ct)
            ?? throw DiningErrors.TableNotFound();
        DiningEntrance.Require(restaurant, table);
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
        var response = await SessionSummaries.ReadAsync(db, restaurantId, session.Id, ct);
        await transaction.CommitAsync(ct);
        return new(response, code);
    }

    public async Task<JoinCodeResponse> ReadCodeAsync(Guid restaurantId, Guid sessionId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var session = await RowLocks.SessionAsync(db, restaurantId, sessionId, RowLock.Share, ct)
            ?? throw DiningErrors.SessionNotFound();
        var result = new JoinCodeResponse(session.Id, codes.Read(session));
        await transaction.CommitAsync(ct);
        return result;
    }
}
