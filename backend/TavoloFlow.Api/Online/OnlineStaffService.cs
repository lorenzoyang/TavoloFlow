using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// STAFF and OWNER decide on waiting online requests. Acceptance creates the ACTIVE session, its single
// order and the order items; from then on the kitchen, pass and bill treat it like any other session.
// Neither decision persists a pending marker in the browser: both are conditional on the request still
// waiting, so a repeat only gets ONLINE_REQUEST_CHANGED and the pending list shows what happened.
public sealed class OnlineStaffService(ApplicationDbContext db, TimeProvider clock)
{
    // The fixed estimated-time choices for pickup; delivery adds its own with the delivery settings.
    public static readonly int[] PickupMinutes = [10, 20, 30, 45];

    // Oldest first. The waiting cap and the ten-minute window keep this small, so it has no paging and no
    // limit: a limit could hide a request until it expires unseen.
    public async Task<OnlinePendingPage> PendingAsync(Guid restaurantId, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var rows = await db
            .OnlineRequests.AsNoTracking()
            .Waiting(restaurantId, now)
            .OrderBy(r => r.SubmittedAt)
            .ThenBy(r => r.Id)
            .ToArrayAsync(ct);
        return new(rows.Select(OnlinePendingRequestResponse.From).ToArray(), now);
    }

    // Accepted online orders until their session closes, oldest acceptance first. Reads only ACTIVE sessions
    // (ix_dining_sessions_active), so it never scans history.
    public async Task<OnlineActivePage> ActiveAsync(Guid restaurantId, CancellationToken ct) =>
        new(await Active(restaurantId).ToArrayAsync(ct));

    // Lock order: restaurant SHARE, then the request row UPDATE. Menu writers and dish deletion take
    // restaurant UPDATE, so the "dish still exists" check below cannot interleave with them, and the
    // platform's services switch waits for this to commit before it counts open work.
    // Pause, hours and sold-out switches are not checked: the request was valid when submitted, and the
    // lines keep their submitted snapshot and prices.
    public async Task<OnlineActiveOrderResponse> AcceptAsync(
        Guid restaurantId,
        Guid id,
        OnlineAcceptInput input,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant =
            await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        var request =
            await RowLocks.OnlineRequestAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw OnlineErrors.RequestMissing();
        var now = clock.GetUtcNow().UtcDateTime;
        if (OnlineRequestState.Phase(request, now) != OnlineRequestPhase.Waiting)
            throw OnlineErrors.RequestChanged();
        // Like opening a table: a suspended restaurant starts no new work.
        if (restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            throw OnlineErrors.Suspended();
        // Delivery acceptance needs the delivery fee, which comes with the delivery settings.
        if (request.Fulfillment == OnlineFulfillment.Delivery)
            throw OnlineErrors.DeliveryNotOffered();
        if (input.EstimatedMinutes is not { } minutes || !PickupMinutes.Contains(minutes))
            throw ApiException.Validation(
                "Choose 10, 20, 30 or 45 minutes.",
                "estimatedMinutes",
                "Invalid time."
            );

        var dishIds = request.Lines.Select(line => line.MenuItemId).Distinct().ToArray();
        var existing = (
            await db
                .MenuItems.Where(m => m.RestaurantId == restaurantId && dishIds.Contains(m.Id))
                .Select(m => m.Id)
                .ToArrayAsync(ct)
        ).ToHashSet();
        var session = new DiningSession
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            Channel = SessionChannel.Pickup,
            OpenedAt = now,
        };
        // Created now, not at submission: the kitchen sorts, groups and chimes by when work arrives.
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            DiningSessionId = session.Id,
            ClientRequestId = request.ClientRequestId,
            TotalAmountCents = request.ItemsTotalCents,
            DefaultLanguageSnapshot = request.DefaultLanguageSnapshot,
            CreatedAt = now,
        };
        foreach (var line in request.Lines)
            order.Items.Add(line.ToOrderItem(restaurantId, existing.Contains(line.MenuItemId)));
        db.DiningSessions.Add(session);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        var accepted = await db
            .OnlineRequests.Where(r =>
                r.RestaurantId == restaurantId
                && r.Id == id
                && r.AcceptedAt == null
                && r.RejectedAt == null
            )
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(r => r.AcceptedAt, now)
                        .SetProperty(r => r.EstimatedAt, now.AddMinutes(minutes))
                        .SetProperty(r => r.SessionId, session.Id),
                ct
            );
        if (accepted != 1)
            throw OnlineErrors.RequestChanged();
        var result = await Active(restaurantId, session.Id).SingleAsync(ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    // Only the request row: one conditional update, still waiting at the current time. Rejection cannot be
    // undone, so the page asks for confirmation first.
    public async Task RejectAsync(
        Guid restaurantId,
        Guid id,
        OnlineRejectInput input,
        CancellationToken ct
    )
    {
        OnlineRejectReason? reason = null;
        if (input.Reason is not null)
        {
            if (!ApiEnum.TryParse(input.Reason, out OnlineRejectReason parsed))
                throw ApiException.Validation(
                    "Choose a listed reason.",
                    "reason",
                    "Invalid reason."
                );
            reason = parsed;
        }
        var now = clock.GetUtcNow().UtcDateTime;
        var target = db.OnlineRequests.Where(r => r.RestaurantId == restaurantId && r.Id == id);
        var fulfillment = await target
            .Select(r => (OnlineFulfillment?)r.Fulfillment)
            .SingleOrDefaultAsync(ct);
        if (fulfillment is null)
            throw OnlineErrors.RequestMissing();
        if (reason == OnlineRejectReason.OutOfRange && fulfillment != OnlineFulfillment.Delivery)
            throw ApiException.Validation(
                "Out of range applies to delivery only.",
                "reason",
                "Delivery only."
            );
        var rejected = await target
            .Waiting(restaurantId, now)
            .ExecuteUpdateAsync(
                u => u.SetProperty(r => r.RejectedAt, now).SetProperty(r => r.RejectReason, reason),
                ct
            );
        if (rejected != 1)
            throw OnlineErrors.RequestChanged();
    }

    private IQueryable<OnlineActiveOrderResponse> Active(
        Guid restaurantId,
        Guid? sessionId = null
    ) =>
        db
            .DiningSessions.AsNoTracking()
            .Where(s =>
                s.RestaurantId == restaurantId
                && s.Status == DiningSessionStatus.Active
                && s.Channel != SessionChannel.DineIn
                && s.OnlineRequest != null
                && (sessionId == null || s.Id == sessionId)
            )
            .OrderBy(s => s.OpenedAt)
            .ThenBy(s => s.Id)
            .Select(s => new OnlineActiveOrderResponse(
                s.Id,
                s.OnlineRequest!.Number,
                ApiEnum.Text(s.Channel),
                s.OnlineRequest.CustomerName,
                s.OnlineRequest.CustomerPhone,
                s.OnlineRequest.DeliveryAddress,
                s.OnlineRequest.DeliveryNotes,
                s.OnlineRequest.AcceptedAt!.Value,
                s.OnlineRequest.EstimatedAt!.Value,
                s.Orders.SelectMany(o => o.Items).Count(),
                s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.New),
                s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.Ready)
            ));
}
