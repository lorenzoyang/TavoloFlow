using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Billing;

public sealed class BillingService(ApplicationDbContext db, TimeProvider clock)
{
    public Task<BillSummaryResponse> CheckoutAsync(
        Guid restaurantId,
        Guid id,
        CheckoutInput input,
        CancellationToken ct
    ) =>
        CloseAsync(
            restaurantId,
            id,
            SessionCloseReason.Paid,
            input.ExpectedBillVersion,
            input.ConfirmedTotalCents,
            ct
        );

    public Task<BillSummaryResponse> CloseEmptyAsync(
        Guid restaurantId,
        Guid id,
        CloseZeroBillInput input,
        CancellationToken ct
    ) => CloseZeroBillAsync(restaurantId, id, SessionCloseReason.Empty, input, ct);

    public Task<BillSummaryResponse> CloseVoidAsync(
        Guid restaurantId,
        Guid id,
        CloseZeroBillInput input,
        CancellationToken ct
    ) => CloseZeroBillAsync(restaurantId, id, SessionCloseReason.Voided, input, ct);

    public Task<BillSummaryResponse> CancelReservationAsync(
        Guid restaurantId,
        Guid id,
        ReservationCancelReason? reason,
        CancellationToken ct
    ) =>
        CloseAsync(
            restaurantId,
            id,
            SessionCloseReason.Voided,
            null,
            0,
            ct,
            cancelReservation: true,
            reservationCancelReason: reason
        );

    // Online orders only, OWNER only (the controller), like PAID: positive receivable and no NEW dishes.
    public Task<BillSummaryResponse> CloseNoShowAsync(
        Guid restaurantId,
        Guid id,
        CloseNoShowInput input,
        CancellationToken ct
    )
    {
        if (input.NoShowConfirmed != true)
            throw ApiException.Validation("Confirm that the customer didn't collect the order.");
        return CloseAsync(
            restaurantId,
            id,
            SessionCloseReason.NoShow,
            input.ExpectedBillVersion,
            input.ConfirmedTotalCents,
            ct
        );
    }

    // OWNER corrects a delivery fee before closure. Like a cancellation it changes the bill, so it takes
    // only the session UPDATE lock, requires the confirmed version and increments it; the version alone
    // makes a lost or repeated request harmless, so the browser persists no marker. An unchanged fee
    // writes nothing and keeps the version.
    public async Task<BillSummaryResponse> SetDeliveryFeeAsync(
        Guid restaurantId,
        Guid id,
        DeliveryFeeInput input,
        CancellationToken ct
    )
    {
        if (input.DeliveryFeeCents is not { } fee || fee < 0 || fee > InputRules.MaxSafeCents)
            throw InvalidDeliveryFee();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var session =
            await RowLocks.SessionAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status == DiningSessionStatus.Closed)
            throw DiningErrors.SessionClosed();
        var bill = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        if (bill.BillVersion != input.ExpectedBillVersion)
            throw BillingErrors.Changed(bill);
        if (session.Channel != SessionChannel.Delivery)
            throw BillingErrors.Conflict(
                "SESSION_NOT_DELIVERY",
                "Only delivery orders have a delivery fee.",
                bill
            );
        if (fee == session.DeliveryFeeCents)
        {
            await tx.CommitAsync(ct);
            return bill;
        }
        // Like acceptance: every ordered item plus the fee stays a safe integer.
        var items = await db
            .OrderItems.Where(i => i.RestaurantId == restaurantId && i.Order.DiningSessionId == id)
            .SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        if (!OnlineDelivery.FeeFits(items, fee))
            throw InvalidDeliveryFee();
        await db
            .DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == id)
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(s => s.DeliveryFeeCents, fee)
                        .SetProperty(s => s.BillVersion, s => s.BillVersion + 1),
                ct
            );
        var result = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    private static ApiException InvalidDeliveryFee() =>
        ApiException.Validation(
            "Enter the delivery fee in whole cents, 0 for free delivery.",
            "deliveryFeeCents",
            "Invalid fee."
        );

    private Task<BillSummaryResponse> CloseZeroBillAsync(
        Guid restaurantId,
        Guid id,
        SessionCloseReason reason,
        CloseZeroBillInput input,
        CancellationToken ct
    )
    {
        if (input.GuestsLeftConfirmed != true || input.ConfirmedTotalCents != 0)
            throw ApiException.Validation("Check the zero bill and confirm the guests have left.");
        return CloseAsync(
            restaurantId,
            id,
            reason,
            input.ExpectedBillVersion,
            input.ConfirmedTotalCents,
            ct
        );
    }

    // PAID, VOIDED, EMPTY and NO_SHOW share one path. Order creation, kitchen transitions and closure all serialize
    // on this session's UPDATE lock, so the bill checked here is exactly the bill that gets closed.
    private async Task<BillSummaryResponse> CloseAsync(
        Guid restaurantId,
        Guid id,
        SessionCloseReason reason,
        int? version,
        long? amount,
        CancellationToken ct,
        bool cancelReservation = false,
        ReservationCancelReason? reservationCancelReason = null
    )
    {
        if (
            (!cancelReservation && (version is null or <= 0))
            || amount is null or < 0 or > InputRules.MaxSafeCents
        )
            throw ApiException.Validation(
                "Provide a valid bill version and an amount in whole euro cents."
            );
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Never lock an entrance (restaurant or table) row after this one.
        var session =
            await RowLocks.SessionAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw DiningErrors.SessionNotFound();
        var bill = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        DateTime? reservationCancelledAt = null;
        if (cancelReservation)
        {
            if (bill.Online?.KitchenStartsAt is not { } starts)
                throw OnlineErrors.ReservationChanged();
            if (session.Status == DiningSessionStatus.Active)
            {
                var cancelledAt = clock.GetUtcNow().UtcDateTime;
                if (cancelledAt < session.OpenedAt)
                    cancelledAt = session.OpenedAt;
                if (
                    cancelledAt >= starts
                    || bill.OrderCount != 1
                    || bill.NewItemCount != bill.ItemCount
                )
                    throw OnlineErrors.ReservationChanged();
                if (session.BillVersion == int.MaxValue)
                    throw BillingErrors.Conflict(
                        "BILL_LIMIT_REACHED",
                        "The bill version has reached the supported limit.",
                        bill
                    );
                reservationCancelledAt = cancelledAt;
                await CancelUnstartedOrderAsync(restaurantId, id, cancelledAt, ct);
                bill = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
            }
            else if (session.ClosedAt >= starts)
                throw OnlineErrors.ReservationChanged();
            version = bill.BillVersion;
        }
        if (session.Status == DiningSessionStatus.Closed)
        {
            // Repeating the identical closure returns the stored result; nothing can rewrite it.
            if (
                session.CloseReason != reason
                || session.BillVersion != version
                || session.ClosedTotalCents != amount
            )
                throw DiningErrors.SessionClosed();
            await tx.CommitAsync(ct);
            return bill;
        }
        ValidateClosure(bill, session.Channel, reason, version, amount.Value);

        var latest = await db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == id)
            .Select(o => (DateTime?)(o.ProcessedAt ?? o.CreatedAt))
            .MaxAsync(ct);
        var latestServedAt = await db
            .OrderItems.Where(i => i.RestaurantId == restaurantId && i.Order.DiningSessionId == id)
            .MaxAsync(i => i.ServedAt, ct);
        var now = reservationCancelledAt ?? clock.GetUtcNow().UtcDateTime;
        if (now < session.OpenedAt)
            now = session.OpenedAt;
        if (latest is not null && now < latest)
            now = latest.Value;
        if (latestServedAt is not null && now < latestServedAt)
            now = latestServedAt.Value;
        var changed = await db
            .DiningSessions.Where(s =>
                s.RestaurantId == restaurantId
                && s.Id == id
                && s.Status == DiningSessionStatus.Active
            )
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(s => s.Status, DiningSessionStatus.Closed)
                        .SetProperty(s => s.CloseReason, reason)
                        .SetProperty(s => s.ReservationCancelReason, reservationCancelReason)
                        .SetProperty(s => s.ClosedAt, now)
                        .SetProperty(s => s.ClosedTotalCents, bill.TotalAmountCents)
                        .SetProperty(s => s.JoinCodeCiphertext, (string?)null),
                ct
            );
        if (changed != 1)
            throw DiningErrors.SessionClosed();
        // Every closure removes remaining READY dishes from the pass, including VOIDED and NO_SHOW.
        // A closure-stamped ServedAt is not evidence that a dish actually reached the customer.
        // Closing time includes processed and existing served times; the clamp also guards ck_order_item_served.
        await db
            .OrderItems.Where(i =>
                i.RestaurantId == restaurantId
                && i.Order.DiningSessionId == id
                && i.Status == OrderItemStatus.Ready
                && i.ServedAt == null
            )
            .ExecuteUpdateAsync(
                u => u.SetProperty(i => i.ServedAt, i => i.ReadyAt > now ? i.ReadyAt : now),
                ct
            );
        var result = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    private static void ValidateClosure(
        BillSummaryResponse bill,
        SessionChannel channel,
        SessionCloseReason reason,
        int? version,
        long amount
    )
    {
        if (bill.BillVersion != version)
            throw BillingErrors.Changed(bill);
        if (reason == SessionCloseReason.NoShow && channel == SessionChannel.DineIn)
            throw BillingErrors.Conflict(
                "SESSION_NOT_ONLINE",
                "Only online orders close as not collected.",
                bill
            );
        // EMPTY means no order was ever placed, not even a cancelled one; that check precedes the amount.
        if (reason == SessionCloseReason.Empty && bill.OrderCount > 0)
            throw BillingErrors.Conflict(
                "SESSION_HAS_ORDERS",
                "This visit has orders: it can't be closed as an empty table.",
                bill
            );
        if (bill.TotalAmountCents != amount)
            throw BillingErrors.Changed(bill);
        if (bill.NewItemCount > 0)
            throw BillingErrors.Conflict(
                "ORDERS_PENDING",
                "Some dishes are still waiting: finish them in the kitchen or cancel them.",
                bill
            );
        if (
            reason is SessionCloseReason.Paid or SessionCloseReason.NoShow
            && bill.TotalAmountCents <= 0
        )
            throw BillingErrors.Conflict(
                "SESSION_NOT_PAYABLE",
                "A zero bill closes as empty or voided, not as paid or not collected.",
                bill
            );
        if (
            reason == SessionCloseReason.Voided
            && (
                bill.OrderCount == 0
                || bill.ItemCount == 0
                || bill.CancelledItemCount != bill.ItemCount
            )
        )
            throw BillingErrors.Conflict(
                "SESSION_NOT_VOIDABLE",
                "A bill closes at zero only if it has orders and every dish is cancelled.",
                bill
            );
    }

    private async Task CancelUnstartedOrderAsync(
        Guid restaurantId,
        Guid id,
        DateTime now,
        CancellationToken ct
    )
    {
        await db
            .OrderItems.Where(i =>
                i.RestaurantId == restaurantId
                && i.Order.DiningSessionId == id
                && i.Status == OrderItemStatus.New
            )
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(i => i.Status, OrderItemStatus.Cancelled)
                        .SetProperty(i => i.CancelledAt, now),
                ct
            );
        await db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == id)
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(o => o.Status, OrderStatus.Processed)
                        .SetProperty(o => o.ProcessedAt, now),
                ct
            );
        await db
            .DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == id)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
    }
}
