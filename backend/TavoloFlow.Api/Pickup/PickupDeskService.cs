using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Pickup;

// Staff decisions on pickup requests. Only acceptance creates the pickup session and its order; from then on
// kitchen, pass and billing treat it like any other session.
public sealed class PickupDeskService(ApplicationDbContext db, TimeProvider clock)
{
    private static readonly int[] EstimatedMinutes = [15, 20, 30, 45];

    // Reads only the last ten minutes of (restaurant_id, expires_at); one statement is a consistent snapshot.
    public async Task<PendingPickupsResponse> PendingAsync(Guid restaurantId, CancellationToken ct)
    {
        var rows = await PickupState.Pending(db.PickupRequests.AsNoTracking().Include(r => r.Items)
                .Where(r => r.RestaurantId == restaurantId), Now())
            .OrderBy(r => r.SubmittedAt).ThenBy(r => r.Id).ToArrayAsync(ct);
        return new(rows.Select(PendingPickupResponse.From).ToArray(), PickupState.PendingLimit);
    }

    public async Task<AcceptedPickupResponse> AcceptAsync(Guid restaurantId, Guid id, int? minutes, CancellationToken ct)
    {
        if (minutes is not { } estimate || !EstimatedMinutes.Contains(estimate))
            throw ApiException.Validation("预计取餐时间须为 15、20、30 或 45 分钟。");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Item deletion holds restaurant UPDATE while it clears request item references, so it never
        // interleaves with the copy below. No pause or hours check: the guest ordered while allowed.
        if (await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct) is null) throw PickupErrors.NotFound();
        var request = await RowLocks.PickupRequestAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw PickupErrors.NotFound();
        var now = Now();
        if (PickupState.Of(request, now) != PickupRequestState.Pending) throw PickupErrors.Changed();
        var items = await db.PickupRequestItems.AsNoTracking()
            .Where(i => i.RestaurantId == restaurantId && i.PickupRequestId == id).OrderBy(i => i.Id).ToArrayAsync(ct);

        // The order is created now, so the kitchen's sorting, wait times and new-order chime start at acceptance.
        var session = new DiningSession
        {
            Id = Guid.CreateVersion7(), RestaurantId = restaurantId, Channel = SessionChannel.Pickup, OpenedAt = now
        };
        var order = new Order
        {
            Id = Guid.CreateVersion7(), RestaurantId = restaurantId, DiningSessionId = session.Id,
            ClientRequestId = request.ClientRequestId, TotalAmountCents = request.TotalAmountCents,
            DefaultLanguageSnapshot = request.DefaultLanguageSnapshot, CreatedAt = now
        };
        foreach (var item in items) order.Items.Add(OrderLineSnapshot.From(item).ToOrderItem(restaurantId));
        session.Orders.Add(order);
        db.DiningSessions.Add(session);
        await db.SaveChangesAsync(ct);
        var ready = now.AddMinutes(estimate);
        var changed = await db.PickupRequests.Where(r => r.RestaurantId == restaurantId && r.Id == id &&
                r.AcceptedAt == null && r.RejectedAt == null && r.ExpiresAt > now)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.AcceptedAt, now).SetProperty(r => r.EstimatedReadyAt, ready)
                .SetProperty(r => r.SessionId, session.Id), ct);
        if (changed != 1) throw PickupErrors.Changed();
        await tx.CommitAsync(ct);
        return new(session.Id, request.PickupNumber, ready);
    }

    // Only the request row: a rejection touches no session or order.
    public async Task RejectAsync(Guid restaurantId, Guid id, string? reason, CancellationToken ct)
    {
        PickupRejectReason? value = null;
        if (reason is not null)
        {
            if (!ApiEnum.TryParse(reason, out PickupRejectReason parsed))
                throw ApiException.Validation("拒单原因须为 SOLD_OUT、BUSY 或 CLOSING，也可以不填。");
            value = parsed;
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var request = await RowLocks.PickupRequestAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw PickupErrors.NotFound();
        var now = Now();
        if (PickupState.Of(request, now) != PickupRequestState.Pending) throw PickupErrors.Changed();
        var changed = await db.PickupRequests.Where(r => r.RestaurantId == restaurantId && r.Id == id &&
                r.AcceptedAt == null && r.RejectedAt == null && r.ExpiresAt > now)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.RejectedAt, now).SetProperty(r => r.RejectReason, value), ct);
        if (changed != 1) throw PickupErrors.Changed();
        await tx.CommitAsync(ct);
    }

    // Today's requests that never became orders, newest first. Only one business date is read, so the list
    // never grows with history; requests still waiting are on the pending list instead.
    public async Task<UnacceptedPickupsResponse> UnacceptedAsync(Guid restaurantId, CancellationToken ct)
    {
        var now = Now();
        var zoneId = await db.Restaurants.Where(r => r.Id == restaurantId).Select(r => r.TimeZone).SingleAsync(ct);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, TimeZoneInfo.FindSystemTimeZoneById(zoneId)));
        var rows = await PickupState.Unaccepted(db.PickupRequests.AsNoTracking()
                .Where(r => r.RestaurantId == restaurantId && r.BusinessDate == today), now)
            .OrderByDescending(r => r.SubmittedAt).ThenByDescending(r => r.Id).ToArrayAsync(ct);
        return new(rows.Select(r => new UnacceptedPickupResponse(r.PickupNumber, r.CustomerName, r.CustomerPhone,
            r.SubmittedAt, r.TotalAmountCents, ApiEnum.Text(PickupState.Of(r, now)),
            r.RejectReason is { } reason ? ApiEnum.Text(reason) : null)).ToArray(), today);
    }

    // Microsecond precision, as PostgreSQL stores it, so comparisons with stored times are exact.
    private DateTime Now()
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return now.AddTicks(-(now.Ticks % 10));
    }
}
