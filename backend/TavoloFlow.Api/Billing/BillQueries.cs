using System.Data;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Kitchen;

namespace TavoloFlow.Api.Billing;

public sealed class BillQueries(ApplicationDbContext db, TimeProvider clock)
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
