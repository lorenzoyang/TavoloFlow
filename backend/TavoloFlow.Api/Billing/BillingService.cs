using System.Data;
using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Kitchen;

namespace TavoloFlow.Api.Billing;

public sealed class BillingService(ApplicationDbContext db, TimeProvider clock)
{
    private const long MaxMoney = 9_007_199_254_740_991;

    public async Task<BillPage> ReadAsync(Guid restaurantId, Guid sessionId, bool history,
        string? cursor, int limit, CancellationToken ct)
    {
        ValidateLimit(limit);
        var after = Decode<BillCursor>(cursor);
        if (after is not null && (after.RestaurantId != restaurantId || after.SessionId != sessionId ||
            after.BillVersion < 1 || after.History != history || !ValidPosition(after.At, after.Id)))
            throw InvalidCursor();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var session = await DiningLocks.SessionAsync(db, restaurantId, sessionId, false, ct);
        if (history && session.Status != DiningSessionStatus.Closed) throw DiningException.Missing();
        if (!history && session.Status != DiningSessionStatus.Active) throw DiningException.Closed();
        var summary = await SummaryAsync(restaurantId, sessionId, ct);
        if (after is not null && after.BillVersion != session.BillVersion) throw BillingException.Changed(summary);
        var query = db.Orders.AsNoTracking().Include(o => o.Items).Include(o => o.DiningSession)
            .Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == sessionId);
        if (after is not null)
            query = query.Where(o => EF.Functions.GreaterThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.At, after.Id)));
        var rows = await query.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id).Take(limit + 1).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray();
        var next = rows.Length > limit ? Encode(new BillCursor(restaurantId, sessionId, history, session.BillVersion,
            page[^1].CreatedAt, page[^1].Id)) : null;
        await tx.CommitAsync(ct);
        return new(summary, page.Select(KitchenOrderResponse.From).ToArray(), next);
    }

    public Task<BillSummaryResponse> CheckoutAsync(Guid restaurantId, Guid id, CheckoutInput input, CancellationToken ct) =>
        CloseAsync(restaurantId, id, SessionCloseReason.Paid, input.ExpectedBillVersion, input.ConfirmedTotalCents, ct);

    public Task<BillSummaryResponse> CloseVoidAsync(Guid restaurantId, Guid id, CloseVoidInput input, CancellationToken ct)
    {
        if (input.GuestsLeftConfirmed != true || input.ConfirmedTotalCents != 0)
            throw BillingException.Invalid("请核对零账单并确认顾客已离桌。");
        return CloseAsync(restaurantId, id, SessionCloseReason.Voided, input.ExpectedBillVersion, input.ConfirmedTotalCents, ct);
    }

    private async Task<BillSummaryResponse> CloseAsync(Guid restaurantId, Guid id, SessionCloseReason reason,
        int? version, long? amount, CancellationToken ct)
    {
        if (version is null or <= 0 || amount is null or < 0 or > MaxMoney)
            throw BillingException.Invalid("请提供有效的账单版本和整数欧分金额。");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // All order writers and closure operations coordinate here. Never lock an entrance row afterwards.
        var session = await DiningLocks.SessionAsync(db, restaurantId, id, true, ct);
        var bill = await SummaryAsync(restaurantId, id, ct);
        if (session.Status == DiningSessionStatus.Closed)
        {
            if (session.CloseReason != reason || session.BillVersion != version || session.ClosedTotalCents != amount)
                throw DiningException.Closed();
            await tx.CommitAsync(ct);
            return bill;
        }
        if (bill.BillVersion != version || bill.TotalAmountCents != amount) throw BillingException.Changed(bill);
        if (bill.NewOrderCount > 0)
            throw new BillingException(409, "ORDERS_PENDING", "仍有待处理订单，请先到厨房完成或按实际情况取消。", bill);
        if (reason == SessionCloseReason.Paid && bill.TotalAmountCents <= 0)
            throw new BillingException(409, "SESSION_NOT_PAYABLE", "零账单应按空桌或全部取消关闭，不记录为收款。", bill);
        if (reason == SessionCloseReason.Voided && (bill.OrderCount == 0 || bill.CancelledOrderCount != bill.OrderCount))
            throw new BillingException(409, "SESSION_NOT_VOIDABLE", "只有本轮已有订单且全部取消时，才能按零账单关闭。", bill);

        var latest = await db.Orders.Where(o => o.RestaurantId == restaurantId && o.DiningSessionId == id)
            .Select(o => (DateTime?)(o.CancelledAt ?? o.ReadyAt ?? o.CreatedAt)).MaxAsync(ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (now < session.OpenedAt) now = session.OpenedAt;
        if (latest is not null && now < latest) now = latest.Value;
        var changed = await db.DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == id && s.Status == DiningSessionStatus.Active)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, DiningSessionStatus.Closed)
                .SetProperty(s => s.CloseReason, reason).SetProperty(s => s.ClosedAt, now)
                .SetProperty(s => s.ClosedTotalCents, bill.TotalAmountCents)
                .SetProperty(s => s.JoinCodeCiphertext, (string?)null), ct);
        if (changed != 1) throw DiningException.Closed();
        var result = await SummaryAsync(restaurantId, id, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    public async Task<HistoryPage> HistoryAsync(Guid restaurantId, string? fromDate, string? toDate,
        string? tableLabel, string? closeReason, string? cursor, int limit, CancellationToken ct)
    {
        ValidateLimit(limit);
        tableLabel = string.IsNullOrWhiteSpace(tableLabel) ? null : tableLabel.Trim();
        if (tableLabel?.Length > 50) throw BillingException.Invalid("桌号最多 50 个字符。");
        if (closeReason is not null && closeReason is not ("PAID" or "EMPTY" or "VOIDED"))
            throw BillingException.Invalid("关闭原因须为 PAID、EMPTY 或 VOIDED。");
        var after = Decode<HistoryCursor>(cursor);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var zoneId = await db.Restaurants.Where(r => r.Id == restaurantId).Select(r => r.TimeZone).SingleAsync(ct);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
        DateOnly from, to;
        if (fromDate is null && toDate is null)
        {
            // Keep an omitted range pinned across pagination, including local midnight.
            from = after?.From ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
            to = after?.To ?? from;
        }
        else if (!DateOnly.TryParseExact(fromDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            !DateOnly.TryParseExact(toDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
            throw BillingException.Invalid("请同时提供 YYYY-MM-DD 格式的起止日期。");
        if (from > to || from == DateOnly.MinValue || to == DateOnly.MaxValue)
            throw BillingException.Invalid("日期范围无效。");
        var start = TimeZoneInfo.ConvertTimeToUtc(from.ToDateTime(TimeOnly.MinValue), zone);
        var end = TimeZoneInfo.ConvertTimeToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue), zone);
        if (after is not null && (after.RestaurantId != restaurantId || after.From != from || after.To != to ||
            after.TableLabel != tableLabel || after.CloseReason != closeReason || !ValidPosition(after.At, after.Id)))
            throw InvalidCursor();
        var sessions = db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId &&
            s.Status == DiningSessionStatus.Closed && s.ClosedAt >= start && s.ClosedAt < end);
        if (tableLabel is not null) sessions = sessions.Where(s => s.TableLabelSnapshot == tableLabel);
        if (closeReason is not null)
        {
            var reason = closeReason == "PAID" ? SessionCloseReason.Paid : closeReason == "EMPTY" ? SessionCloseReason.Empty : SessionCloseReason.Voided;
            sessions = sessions.Where(s => s.CloseReason == reason);
        }
        var total = await sessions.LongCountAsync(ct);
        if (after is not null)
            sessions = sessions.Where(s => EF.Functions.LessThan(ValueTuple.Create(s.ClosedAt!.Value, s.Id), ValueTuple.Create(after.At, after.Id)));
        var rows = await Summaries(sessions.OrderByDescending(s => s.ClosedAt).ThenByDescending(s => s.Id))
            .Take(limit + 1).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray();
        var next = rows.Length > limit ? Encode(new HistoryCursor(restaurantId, from, to, tableLabel, closeReason,
            page[^1].ClosedAt!.Value, page[^1].SessionId)) : null;
        await tx.CommitAsync(ct);
        return new(page, next, total, from, to, zoneId);
    }

    private Task<BillSummaryResponse> SummaryAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        Summaries(db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId && s.Id == id)).SingleAsync(ct);

    private static IQueryable<BillSummaryResponse> Summaries(IQueryable<DiningSession> sessions) => sessions.Select(s =>
        new BillSummaryResponse(s.Id, s.TableId, s.TableLabelSnapshot, s.Status == DiningSessionStatus.Active ? "ACTIVE" : "CLOSED",
            s.OpenedAt, s.ClosedAt, s.CloseReason == null ? null : s.CloseReason == SessionCloseReason.Paid ? "PAID" : s.CloseReason == SessionCloseReason.Empty ? "EMPTY" : "VOIDED",
            s.BillVersion, s.Orders.Count, s.Orders.Count(o => o.Status == OrderStatus.New), s.Orders.Count(o => o.Status == OrderStatus.Cancelled),
            s.ClosedTotalCents ?? s.Orders.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.TotalAmountCents)));

    private sealed record BillCursor(Guid RestaurantId, Guid SessionId, bool History, int BillVersion, DateTime At, Guid Id);
    private sealed record HistoryCursor(Guid RestaurantId, DateOnly From, DateOnly To, string? TableLabel, string? CloseReason, DateTime At, Guid Id);
    private static bool ValidPosition(DateTime at, Guid id) => at.Kind == DateTimeKind.Utc && id != Guid.Empty;
    private static void ValidateLimit(int limit)
    { if (limit is < 1 or > 100) throw BillingException.Invalid("每页数量须为 1–100。"); }
    private static BillingException InvalidCursor() => BillingException.Invalid("分页位置无效，请重新查询。");
    private static string Encode<T>(T value) => WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(value));
    private static T? Decode<T>(string? raw) where T : class
    {
        if (raw is null) return null;
        try
        {
            if (raw.Length > 2048) throw new FormatException();
            return JsonSerializer.Deserialize<T>(WebEncoders.Base64UrlDecode(raw)) ?? throw new FormatException();
        }
        catch (Exception e) when (e is FormatException or JsonException or ArgumentException) { throw InvalidCursor(); }
    }
}
