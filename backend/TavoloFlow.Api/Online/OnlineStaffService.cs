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
    // The fixed estimated-time choices: ready to collect, or delivered.
    public static readonly int[] PickupMinutes = [10, 20, 30, 45];
    public static readonly int[] DeliveryMinutes = [30, 45, 60, 90];

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
        new(await ActiveOrdersAsync(restaurantId, null, ct));

    // Lock order: restaurant SHARE, then the request row UPDATE. Menu writers and dish deletion take
    // restaurant UPDATE, so the "dish still exists" check below cannot interleave with them, and the
    // platform's services switch waits for this to commit before it counts open work.
    // Pause, hours, sold-out and delivery switches are not checked: the request was valid when submitted,
    // and the lines keep their submitted snapshot and prices. Delivery adds the fee whoever accepts enters.
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
        var delivery = request.Fulfillment == OnlineFulfillment.Delivery;
        var choices = delivery ? DeliveryMinutes : PickupMinutes;
        if (input.EstimatedMinutes is not { } minutes || !choices.Contains(minutes))
            throw ApiException.Validation(
                $"Choose {string.Join(", ", choices)} minutes.",
                "estimatedMinutes",
                "Invalid time."
            );
        var fee = DeliveryFee(request, input.DeliveryFeeCents);

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
            Channel = delivery ? SessionChannel.Delivery : SessionChannel.Pickup,
            DeliveryFeeCents = fee,
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
        // A decided request no longer occupies a waiting slot, so its source digests have no use;
        // rejection clears them too.
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
                        .SetProperty(r => r.SessionId, session.Id)
                        .SetProperty(r => r.BrowserKey, (string?)null)
                        .SetProperty(r => r.IpKey, (string?)null),
                ct
            );
        if (accepted != 1)
            throw OnlineErrors.RequestChanged();
        var result = (await ActiveOrdersAsync(restaurantId, session.Id, ct)).Single();
        await transaction.CommitAsync(ct);
        return result;
    }

    // Delivery requires an explicit fee, 0 for free; the bill (items plus fee) stays a safe integer.
    private static long? DeliveryFee(OnlineRequest request, long? fee)
    {
        if (request.Fulfillment != OnlineFulfillment.Delivery)
            return fee is null
                ? null
                : throw ApiException.Validation(
                    "Pickup orders take no delivery fee.",
                    "deliveryFeeCents",
                    "Pickup only."
                );
        if (
            fee is not { } cents
            || cents < 0
            || cents > InputRules.MaxSafeCents - request.ItemsTotalCents
        )
            throw ApiException.Validation(
                "Enter the delivery fee in whole cents, 0 for free delivery.",
                "deliveryFeeCents",
                "Invalid fee."
            );
        return cents;
    }

    // Only the request row: read the time after acquiring UPDATE, just like acceptance. A decision that
    // waited beyond expiry must not turn an expired request back into a rejected one.
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
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var request =
            await RowLocks.OnlineRequestAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw OnlineErrors.RequestMissing();
        if (
            reason == OnlineRejectReason.OutOfRange
            && request.Fulfillment != OnlineFulfillment.Delivery
        )
            throw ApiException.Validation(
                "Out of range applies to delivery only.",
                "reason",
                "Delivery only."
            );
        var now = clock.GetUtcNow().UtcDateTime;
        if (OnlineRequestState.Phase(request, now) != OnlineRequestPhase.Waiting)
            throw OnlineErrors.RequestChanged();
        var rejected = await db
            .OnlineRequests.Where(r => r.Id == id)
            .Waiting(restaurantId, now)
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(r => r.RejectedAt, now)
                        .SetProperty(r => r.RejectReason, reason)
                        .SetProperty(r => r.BrowserKey, (string?)null)
                        .SetProperty(r => r.IpKey, (string?)null),
                ct
            );
        if (rejected != 1)
            throw OnlineErrors.RequestChanged();
        await transaction.CommitAsync(ct);
    }

    // Through the bill summaries, so the amount to collect is the bill's own.
    private async Task<OnlineActiveOrderResponse[]> ActiveOrdersAsync(
        Guid restaurantId,
        Guid? sessionId,
        CancellationToken ct
    ) =>
        (
            await SessionSummaries
                .Project(
                    db.DiningSessions.AsNoTracking()
                        .Where(s =>
                            s.RestaurantId == restaurantId
                            && s.Status == DiningSessionStatus.Active
                            && s.Channel != SessionChannel.DineIn
                            && s.OnlineRequest != null
                            && (sessionId == null || s.Id == sessionId)
                        )
                        .OrderBy(s => s.OpenedAt)
                        .ThenBy(s => s.Id)
                )
                .ToArrayAsync(ct)
        )
            .Select(OnlineActiveOrderResponse.From)
            .ToArray();
}
