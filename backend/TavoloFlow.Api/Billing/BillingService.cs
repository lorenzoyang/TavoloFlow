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
    public async Task<BillPage> ReadAsync(Guid restaurantId, Guid sessionId, bool history,
        string? cursor, int limit, CancellationToken ct)
    {
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<BillCursor>(cursor, c => c.RestaurantId == restaurantId && c.SessionId == sessionId &&
            c.BillVersion >= 1 && c.History == history && Paging.IsPosition(c.At, c.Id));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var session = await RowLocks.SessionAsync(db, restaurantId, sessionId, RowLock.Share, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (history && session.Status != DiningSessionStatus.Closed) throw DiningErrors.SessionNotFound();
        if (!history && session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        var summary = await SessionSummaries.ReadAsync(db, restaurantId, sessionId, ct);
        if (after is not null && after.BillVersion != session.BillVersion) throw BillingErrors.Changed(summary);
        var query = db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.DiningSession)
            .Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == sessionId);
        if (after is not null)
            query = query.Where(o => EF.Functions.GreaterThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.At, after.Id)));
        var rows = await query.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id).Take(limit + 1).ToArrayAsync(ct);
        var (page, next) = Paging.Page(rows, limit, last =>
            new BillCursor(restaurantId, sessionId, history, session.BillVersion, last.CreatedAt, last.Id));
        await tx.CommitAsync(ct);
        return new(summary, page.Select(KitchenOrderResponse.From).ToArray(), next);
    }

    public Task<BillSummaryResponse> CheckoutAsync(Guid restaurantId, Guid id, CheckoutInput input, CancellationToken ct) =>
        CloseAsync(restaurantId, id, SessionCloseReason.Paid, input.ExpectedBillVersion, input.ConfirmedTotalCents, ct);

    public Task<BillSummaryResponse> CloseEmptyAsync(Guid restaurantId, Guid id, CloseZeroBillInput input, CancellationToken ct) =>
        CloseZeroBillAsync(restaurantId, id, SessionCloseReason.Empty, input, ct);

    public Task<BillSummaryResponse> CloseVoidAsync(Guid restaurantId, Guid id, CloseZeroBillInput input, CancellationToken ct) =>
        CloseZeroBillAsync(restaurantId, id, SessionCloseReason.Voided, input, ct);

    private Task<BillSummaryResponse> CloseZeroBillAsync(Guid restaurantId, Guid id, SessionCloseReason reason,
        CloseZeroBillInput input, CancellationToken ct)
    {
        if (input.GuestsLeftConfirmed != true || input.ConfirmedTotalCents != 0)
            throw ApiException.Validation("请核对零账单并确认顾客已离桌。");
        return CloseAsync(restaurantId, id, reason, input.ExpectedBillVersion, input.ConfirmedTotalCents, ct);
    }

    // PAID, VOIDED and EMPTY share one path. Order creation, kitchen transitions and closure all serialize
    // on this session's UPDATE lock, so the bill checked here is exactly the bill that gets closed.
    private async Task<BillSummaryResponse> CloseAsync(Guid restaurantId, Guid id, SessionCloseReason reason,
        int? version, long? amount, CancellationToken ct)
    {
        if (version is null or <= 0 || amount is null or < 0 or > InputRules.MaxSafeCents)
            throw ApiException.Validation("请提供有效的账单版本和整数欧分金额。");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Never lock an entrance (restaurant or table) row after this one.
        var session = await RowLocks.SessionAsync(db, restaurantId, id, RowLock.Update, ct)
            ?? throw DiningErrors.SessionNotFound();
        var bill = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        if (session.Status == DiningSessionStatus.Closed)
        {
            // Repeating the identical closure returns the stored result; nothing can rewrite it.
            if (session.CloseReason != reason || session.BillVersion != version || session.ClosedTotalCents != amount)
                throw DiningErrors.SessionClosed();
            await tx.CommitAsync(ct);
            return bill;
        }
        if (bill.BillVersion != version) throw BillingErrors.Changed(bill);
        // EMPTY means no order was ever placed, not even a cancelled one; that check precedes the amount.
        if (reason == SessionCloseReason.Empty && bill.OrderCount > 0)
            throw BillingErrors.Conflict("SESSION_HAS_ORDERS", "本轮曾产生订单，不能按空桌关闭。", bill);
        if (bill.TotalAmountCents != amount) throw BillingErrors.Changed(bill);
        if (bill.NewItemCount > 0)
            throw BillingErrors.Conflict("ORDERS_PENDING", "仍有待出餐菜品，请先到厨房完成或按实际情况取消。", bill);
        if (reason == SessionCloseReason.Paid && bill.TotalAmountCents <= 0)
            throw BillingErrors.Conflict("SESSION_NOT_PAYABLE", "零账单应按空桌或全部取消关闭，不记录为收款。", bill);
        if (reason == SessionCloseReason.Voided && (bill.OrderCount == 0 || bill.ItemCount == 0 || bill.CancelledItemCount != bill.ItemCount))
            throw BillingErrors.Conflict("SESSION_NOT_VOIDABLE", "只有本轮已有订单且所有菜品均已取消时，才能按零账单关闭。", bill);

        var latest = await db.Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == id)
            .Select(o => (DateTime?)(o.ProcessedAt ?? o.CreatedAt)).MaxAsync(ct);
        var latestServedAt = await db.OrderItems.Where(i => i.RestaurantId == restaurantId && i.Order.DiningSessionId == id)
            .MaxAsync(i => i.ServedAt, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (now < session.OpenedAt) now = session.OpenedAt;
        if (latest is not null && now < latest) now = latest.Value;
        if (latestServedAt is not null && now < latestServedAt) now = latestServedAt.Value;
        var changed = await db.DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == id && s.Status == DiningSessionStatus.Active)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, DiningSessionStatus.Closed)
                .SetProperty(s => s.CloseReason, reason).SetProperty(s => s.ClosedAt, now)
                .SetProperty(s => s.ClosedTotalCents, bill.TotalAmountCents)
                .SetProperty(s => s.JoinCodeCiphertext, (string?)null), ct);
        if (changed != 1) throw DiningErrors.SessionClosed();
        // A settled bill means every ready dish reached the table, whether or not someone tapped it at the pass.
        // Closing time includes processed and existing served times; the clamp also guards ck_order_item_served.
        await db.OrderItems.Where(i => i.RestaurantId == restaurantId && i.Order.DiningSessionId == id &&
                i.Status == OrderItemStatus.Ready && i.ServedAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(i => i.ServedAt, i => i.ReadyAt > now ? i.ReadyAt : now), ct);
        var result = await SessionSummaries.ReadAsync(db, restaurantId, id, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    public async Task<HistoryPage> HistoryAsync(Guid restaurantId, string? fromDate, string? toDate,
        string? tableLabel, string? closeReason, string? cursor, int limit, CancellationToken ct)
    {
        Paging.EnsureLimit(limit);
        tableLabel = InputRules.TrimToNull(tableLabel);
        if (tableLabel?.Length > 50) throw ApiException.Validation("桌号最多 50 个字符。");
        SessionCloseReason? reason = null;
        if (closeReason is not null)
        {
            if (!ApiEnum.TryParse(closeReason, out SessionCloseReason parsed))
                throw ApiException.Validation("关闭原因须为 PAID、EMPTY 或 VOIDED。");
            reason = parsed;
        }
        var after = Paging.Decode<HistoryCursor>(cursor);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var zoneId = await db.Restaurants.Where(r => r.Id == restaurantId).Select(r => r.TimeZone).SingleAsync(ct);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
        var (from, to) = ResolveDates(fromDate, toDate, after, zone);
        // The cursor is bound to the tenant and to the resolved filters it was issued for.
        if (after is not null && (after.RestaurantId != restaurantId || after.From != from || after.To != to ||
            after.TableLabel != tableLabel || after.CloseReason != closeReason || !Paging.IsPosition(after.At, after.Id)))
            throw Paging.InvalidCursor();
        var start = TimeZoneInfo.ConvertTimeToUtc(from.ToDateTime(TimeOnly.MinValue), zone);
        var end = TimeZoneInfo.ConvertTimeToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue), zone);
        var sessions = db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId &&
            s.Status == DiningSessionStatus.Closed && s.ClosedAt >= start && s.ClosedAt < end);
        if (tableLabel is not null) sessions = sessions.Where(s => s.TableLabelSnapshot == tableLabel);
        if (reason is { } closedAs) sessions = sessions.Where(s => s.CloseReason == closedAs);
        var total = await sessions.LongCountAsync(ct);
        if (after is not null)
            sessions = sessions.Where(s => EF.Functions.LessThan(ValueTuple.Create(s.ClosedAt!.Value, s.Id), ValueTuple.Create(after.At, after.Id)));
        var rows = await SessionSummaries.Project(sessions.OrderByDescending(s => s.ClosedAt).ThenByDescending(s => s.Id)
            .Take(limit + 1)).ToArrayAsync(ct);
        var (page, next) = Paging.Page(rows, limit, last =>
            new HistoryCursor(restaurantId, from, to, tableLabel, closeReason, last.ClosedAt!.Value, last.SessionId));
        await tx.CommitAsync(ct);
        return new(page, next, total, from, to, zoneId);
    }

    // An omitted range means the restaurant's local today; the cursor keeps it pinned across local midnight.
    private (DateOnly From, DateOnly To) ResolveDates(string? fromDate, string? toDate, HistoryCursor? after, TimeZoneInfo zone)
    {
        DateOnly from, to;
        if (fromDate is null && toDate is null)
        {
            from = after?.From ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
            to = after?.To ?? from;
        }
        else if (!DateOnly.TryParseExact(fromDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            !DateOnly.TryParseExact(toDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
            throw ApiException.Validation("请同时提供 YYYY-MM-DD 格式的起止日期。");
        if (from > to || from == DateOnly.MinValue || to == DateOnly.MaxValue)
            throw ApiException.Validation("日期范围无效。");
        return (from, to);
    }

    private sealed record BillCursor(Guid RestaurantId, Guid SessionId, bool History, int BillVersion, DateTime At, Guid Id);
    private sealed record HistoryCursor(Guid RestaurantId, DateOnly From, DateOnly To, string? TableLabel, string? CloseReason, DateTime At, Guid Id);
}
