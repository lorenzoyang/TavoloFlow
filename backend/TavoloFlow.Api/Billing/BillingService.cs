using System.Data;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Kitchen;

namespace TavoloFlow.Api.Billing;

public sealed class BillingService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<BillPage> ReadAsync(
        Guid restaurantId,
        Guid sessionId,
        bool history,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<BillCursor>(
            cursor,
            c =>
                c.RestaurantId == restaurantId
                && c.SessionId == sessionId
                && c.BillVersion >= 1
                && c.History == history
                && Paging.IsPosition(c.At, c.Id)
        );
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var session =
            await RowLocks.SessionAsync(db, restaurantId, sessionId, RowLock.Share, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (history && session.Status != DiningSessionStatus.Closed)
            throw DiningErrors.SessionNotFound();
        if (!history && session.Status != DiningSessionStatus.Active)
            throw DiningErrors.SessionClosed();
        var summary = await SessionSummaries.ReadAsync(db, restaurantId, sessionId, ct);
        if (after is not null && after.BillVersion != session.BillVersion)
            throw BillingErrors.Changed(summary);
        var query = db
            .Orders.AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.DiningSession)
                .ThenInclude(s => s.OnlineRequest)
            .Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == sessionId);
        if (after is not null)
            query = query.Where(o =>
                EF.Functions.GreaterThan(
                    ValueTuple.Create(o.CreatedAt, o.Id),
                    ValueTuple.Create(after.At, after.Id)
                )
            );
        var rows = await query
            .OrderBy(o => o.CreatedAt)
            .ThenBy(o => o.Id)
            .Take(limit + 1)
            .ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new BillCursor(
                restaurantId,
                sessionId,
                history,
                session.BillVersion,
                last.CreatedAt,
                last.Id
            )
        );
        await tx.CommitAsync(ct);
        return new(summary, page.Select(KitchenOrderResponse.From).ToArray(), next);
    }

    // Every ACTIVE session in all channels, oldest first: the bills page. Reads only open visits
    // (ix_dining_sessions_active) in one statement, so the summaries come from one snapshot.
    public async Task<ActiveSessionsPage> ActiveAsync(Guid restaurantId, CancellationToken ct) =>
        new(
            await SessionSummaries
                .Project(
                    db.DiningSessions.AsNoTracking()
                        .Where(s =>
                            s.RestaurantId == restaurantId && s.Status == DiningSessionStatus.Active
                        )
                        .OrderBy(s => s.OpenedAt)
                        .ThenBy(s => s.Id)
                )
                .ToArrayAsync(ct)
        );

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
        if (fee > InputRules.MaxSafeCents - items)
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
        CancellationToken ct
    )
    {
        if (version is null or <= 0 || amount is null or < 0 or > InputRules.MaxSafeCents)
            throw ApiException.Validation(
                "Provide a valid bill version and an amount in whole euro cents."
            );
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Never lock an entrance (restaurant or table) row after this one.
        var session =
            await RowLocks.SessionAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw DiningErrors.SessionNotFound();
        var bill = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
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
        if (bill.BillVersion != version)
            throw BillingErrors.Changed(bill);
        if (reason == SessionCloseReason.NoShow && session.Channel == SessionChannel.DineIn)
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

        var latest = await db
            .Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == id)
            .Select(o => (DateTime?)(o.ProcessedAt ?? o.CreatedAt))
            .MaxAsync(ct);
        var latestServedAt = await db
            .OrderItems.Where(i => i.RestaurantId == restaurantId && i.Order.DiningSessionId == id)
            .MaxAsync(i => i.ServedAt, ct);
        var now = clock.GetUtcNow().UtcDateTime;
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

    public async Task<HistoryPage> HistoryAsync(
        Guid restaurantId,
        string? fromDate,
        string? toDate,
        string? tableLabel,
        string? closeReason,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        Paging.EnsureLimit(limit);
        tableLabel = InputRules.TrimToNull(tableLabel);
        if (tableLabel?.Length > 50)
            throw ApiException.Validation("The table label can be at most 50 characters.");
        SessionCloseReason? reason = null;
        if (closeReason is not null)
        {
            if (!ApiEnum.TryParse(closeReason, out SessionCloseReason parsed))
                throw ApiException.Validation(
                    "The closure reason must be PAID, EMPTY, VOIDED or NO_SHOW."
                );
            reason = parsed;
        }
        var after = Paging.Decode<HistoryCursor>(cursor);
        await using var tx = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var zoneId = await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .Select(r => r.TimeZone)
            .SingleAsync(ct);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
        var (from, to) = ResolveDates(fromDate, toDate, after, zone);
        // The cursor is bound to the tenant and to the resolved filters it was issued for.
        if (
            after is not null
            && (
                after.RestaurantId != restaurantId
                || after.From != from
                || after.To != to
                || after.TableLabel != tableLabel
                || after.CloseReason != closeReason
                || !Paging.IsPosition(after.At, after.Id)
            )
        )
            throw Paging.InvalidCursor();
        var start = TimeZoneInfo.ConvertTimeToUtc(from.ToDateTime(TimeOnly.MinValue), zone);
        var end = TimeZoneInfo.ConvertTimeToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue), zone);
        var sessions = db
            .DiningSessions.AsNoTracking()
            .Where(s =>
                s.RestaurantId == restaurantId
                && s.Status == DiningSessionStatus.Closed
                && s.ClosedAt >= start
                && s.ClosedAt < end
            );
        if (tableLabel is not null)
            sessions = sessions.Where(s => s.TableLabelSnapshot == tableLabel);
        if (reason is { } closedAs)
            sessions = sessions.Where(s => s.CloseReason == closedAs);
        var total = await sessions.LongCountAsync(ct);
        if (after is not null)
            sessions = sessions.Where(s =>
                EF.Functions.LessThan(
                    ValueTuple.Create(s.ClosedAt!.Value, s.Id),
                    ValueTuple.Create(after.At, after.Id)
                )
            );
        var rows = await SessionSummaries
            .Project(
                sessions
                    .OrderByDescending(s => s.ClosedAt)
                    .ThenByDescending(s => s.Id)
                    .Take(limit + 1)
            )
            .ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new HistoryCursor(
                restaurantId,
                from,
                to,
                tableLabel,
                closeReason,
                last.ClosedAt!.Value,
                last.SessionId
            )
        );
        await tx.CommitAsync(ct);
        return new(page, next, total, from, to, zoneId);
    }

    // An omitted range means the restaurant's local today; the cursor keeps it pinned across local midnight.
    private (DateOnly From, DateOnly To) ResolveDates(
        string? fromDate,
        string? toDate,
        HistoryCursor? after,
        TimeZoneInfo zone
    )
    {
        DateOnly from,
            to;
        if (fromDate is null && toDate is null)
        {
            from =
                after?.From
                ?? DateOnly.FromDateTime(
                    TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime
                );
            to = after?.To ?? from;
        }
        else if (
            !DateOnly.TryParseExact(
                fromDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out from
            )
            || !DateOnly.TryParseExact(
                toDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out to
            )
        )
            throw ApiException.Validation(
                "Provide both the start and end dates in YYYY-MM-DD format."
            );
        if (from > to || from == DateOnly.MinValue || to == DateOnly.MaxValue)
            throw ApiException.Validation("Invalid date range.");
        return (from, to);
    }

    private sealed record BillCursor(
        Guid RestaurantId,
        Guid SessionId,
        bool History,
        int BillVersion,
        DateTime At,
        Guid Id
    );

    private sealed record HistoryCursor(
        Guid RestaurantId,
        DateOnly From,
        DateOnly To,
        string? TableLabel,
        string? CloseReason,
        DateTime At,
        Guid Id
    );
}
