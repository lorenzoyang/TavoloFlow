using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;

namespace TavoloFlow.Api.Ordering;

public sealed class OrderService(ApplicationDbContext db, TimeProvider clock)
{
    private const long MaxCents = InputRules.MaxSafeCents;

    public Task<OrderCreation> CreateAsync(
        GuestIdentity guest,
        CreateOrderInput input,
        CancellationToken ct
    )
    {
        if (
            input.SessionId is null
            || input.SessionId == Guid.Empty
            || input.ClientRequestId is null
            || input.ClientRequestId == Guid.Empty
        )
            throw OrderErrors.Invalid("sessionId", "Provide a valid visit ID and request ID.");
        RequireTarget(guest, input.SessionId.Value);
        return CreateAsync(
            guest.RestaurantId,
            guest.TableId,
            guest.SessionId,
            input.ClientRequestId.Value,
            input.Items,
            staffPlaced: false,
            ct
        );
    }

    public async Task<OrderCreation> CreateForStaffAsync(
        Guid restaurantId,
        Guid sessionId,
        CreateStaffOrderInput input,
        CancellationToken ct
    )
    {
        if (input.ClientRequestId is not { } requestId || requestId == Guid.Empty)
            throw OrderErrors.Invalid("clientRequestId", "Provide a valid request ID.");

        // Discover the table before locking. The common write rechecks this visit under lock.
        var target =
            await db
                .DiningSessions.AsNoTracking()
                .Where(s =>
                    s.Id == sessionId
                    && s.RestaurantId == restaurantId
                    && s.Channel == SessionChannel.DineIn
                )
                .Select(s => new { s.TableId, s.Status })
                .SingleOrDefaultAsync(ct)
            ?? throw DiningErrors.SessionNotFound();
        if (target.Status != DiningSessionStatus.Active || target.TableId is not { } tableId)
            throw DiningErrors.SessionClosed();
        return await CreateAsync(
            restaurantId,
            tableId,
            sessionId,
            requestId,
            input.Items,
            staffPlaced: true,
            ct
        );
    }

    private async Task<OrderCreation> CreateAsync(
        Guid restaurantId,
        Guid tableId,
        Guid sessionId,
        Guid requestId,
        OrderLineInput?[]? items,
        bool staffPlaced,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // Menu writers and item deletion take restaurant UPDATE, so these SHARE locks keep prices and snapshots
        // stable without serializing orders from different tables.
        var (restaurant, table) = await DiningEntrance.LockAsync(db, restaurantId, tableId, ct);
        var session = await LockSessionAsync(restaurantId, sessionId, RowLock.Update, ct);
        RequireTable(session, tableId);
        var original = await Orders(restaurantId, sessionId)
            .SingleOrDefaultAsync(o => o.ClientRequestId == requestId, ct);
        if (original is not null)
        {
            if (original.IsStaffPlaced != staffPlaced)
                throw OrderErrors.Invalid(
                    "clientRequestId",
                    "This request ID belongs to another order source."
                );
            await transaction.CommitAsync(ct);
            return new(OrderResponse.From(original), false);
        }

        DiningEntrance.Require(restaurant, table);
        if (!staffPlaced && !restaurant.OrderingEnabled)
            throw new ApiException(
                409,
                "ORDERING_PAUSED",
                "The restaurant isn't accepting QR orders right now."
            );
        var lines = OrderLines.Validate(items);
        var snapshots = await OrderLines.SnapshotAsync(db, restaurantId, lines, ct);
        var total = OrderLines.Total(snapshots);
        var existingTotal = await db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == sessionId)
            .SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled)
            .SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        if (existingTotal > MaxCents - total || session.BillVersion == int.MaxValue)
            throw new ApiException(
                409,
                "BILL_LIMIT_REACHED",
                "The bill has reached the supported limit. Ask the staff."
            );

        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            DiningSessionId = sessionId,
            ClientRequestId = requestId,
            IsStaffPlaced = staffPlaced,
            TotalAmountCents = total,
            DefaultLanguageSnapshot = restaurant.DefaultLanguage,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
        };
        foreach (var snapshot in snapshots)
            order.Items.Add(snapshot.ToOrderItem(restaurantId, menuItemExists: true));
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await db
            .DiningSessions.Where(s => s.Id == session.Id && s.RestaurantId == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        // Read PostgreSQL's timestamp precision, so pagination cursors and retry responses agree exactly.
        var saved = await Orders(restaurantId, sessionId).SingleAsync(o => o.Id == order.Id, ct);
        await transaction.CommitAsync(ct);
        return new(OrderResponse.From(saved), true);
    }

    public async Task<OrderResponse> ByRequestAsync(
        GuestIdentity guest,
        Guid sessionId,
        Guid requestId,
        CancellationToken ct
    )
    {
        RequireTarget(guest, sessionId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var session = await LockSessionAsync(guest.RestaurantId, sessionId, RowLock.Share, ct);
        RequireTable(session, guest.TableId);
        var result = await ReadIntentAsync(
            guest.RestaurantId,
            sessionId,
            requestId,
            staffPlaced: false,
            ct
        );
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<OrderResponse> StaffOrderByRequestAsync(
        Guid restaurantId,
        Guid sessionId,
        Guid requestId,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(restaurantId, sessionId, RowLock.Share, ct);
        var result = await ReadIntentAsync(
            restaurantId,
            sessionId,
            requestId,
            staffPlaced: true,
            ct
        );
        await transaction.CommitAsync(ct);
        return result;
    }

    private async Task<OrderResponse> ReadIntentAsync(
        Guid restaurantId,
        Guid sessionId,
        Guid requestId,
        bool staffPlaced,
        CancellationToken ct
    )
    {
        var order =
            await Orders(restaurantId, sessionId)
                .SingleOrDefaultAsync(
                    o => o.ClientRequestId == requestId && o.IsStaffPlaced == staffPlaced,
                    ct
                )
            ?? throw new ApiException(
                404,
                "ORDER_NOT_FOUND",
                "This submission hasn't been found yet. Keep checking, or retry with the original request."
            );
        return OrderResponse.From(order);
    }

    public async Task<OrderPage> ListAsync(
        GuestIdentity guest,
        Guid sessionId,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        RequireTarget(guest, sessionId);
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<OrderCursor>(
            cursor,
            c => c.SessionId == sessionId && Paging.IsPosition(c.CreatedAt, c.Id)
        );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var session = await LockSessionAsync(guest.RestaurantId, sessionId, RowLock.Share, ct);
        RequireTable(session, guest.TableId);
        var query = Orders(guest.RestaurantId, sessionId);
        if (after is not null)
            query = query.Where(o =>
                EF.Functions.LessThan(
                    ValueTuple.Create(o.CreatedAt, o.Id),
                    ValueTuple.Create(after.CreatedAt, after.Id)
                )
            );
        var rows = await query
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Take(limit + 1)
            .ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new OrderCursor(sessionId, last.CreatedAt, last.Id)
        );
        var total = await db
            .Orders.Where(o =>
                o.RestaurantId == guest.RestaurantId && o.DiningSessionId == sessionId
            )
            .SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled)
            .SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        await transaction.CommitAsync(ct);
        return new(page.Select(OrderResponse.From).ToArray(), next, total);
    }

    private IQueryable<Order> Orders(Guid restaurantId, Guid sessionId) =>
        db
            .Orders.AsNoTracking()
            .Include(o => o.Items)
            .Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == sessionId);

    private async Task<DiningSession> LockSessionAsync(
        Guid restaurantId,
        Guid sessionId,
        RowLock mode,
        CancellationToken ct
    )
    {
        // Reading needs only the session lock: no later restaurant/table locks are acquired.
        var session =
            await RowLocks.SessionAsync(db, restaurantId, sessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Channel != SessionChannel.DineIn)
            throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active)
            throw DiningErrors.SessionClosed();
        return session;
    }

    private static void RequireTable(DiningSession session, Guid tableId)
    {
        if (session.TableId != tableId)
            throw GuestErrors.SessionMismatch();
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target)
            throw GuestErrors.SessionMismatch();
    }

    private sealed record OrderCursor(Guid SessionId, DateTime CreatedAt, Guid Id);
}
