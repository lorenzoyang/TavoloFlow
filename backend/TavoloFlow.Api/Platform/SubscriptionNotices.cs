using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public sealed class SubscriptionNotices(
    ApplicationDbContext db,
    SubscriptionService subscriptions,
    TimeProvider clock
)
{
    public async Task<SubscriptionNoticeResponse[]> ReadAsync(
        Guid accountId,
        Guid? restaurantId,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var query = db.SubscriptionNotices.AsNoTracking().Include(n => n.Restaurant).AsQueryable();
        query = restaurantId is { } ownerRestaurant
            ? query.Where(n => n.RestaurantId == ownerRestaurant && n.OwnerAcknowledgedAt == null)
            : query.Where(n =>
                n.Deadline != null && !n.PlatformReceipts.Any(r => r.PlatformUserId == accountId)
            );
        var notices = await query.OrderBy(n => n.CreatedAt).ThenBy(n => n.Id).ToArrayAsync(ct);
        var restaurants = notices
            .Where(n => n.Deadline != null)
            .Select(n => n.Restaurant)
            .DistinctBy(r => r.Id)
            .ToArray();
        var summaries = await subscriptions.SummariesAsync(restaurants, ct);
        var response = notices
            .Where(n => n.Deadline == null || IsCurrent(n, summaries[n.RestaurantId].Renewal))
            .Select(n => new SubscriptionNoticeResponse(
                n.Id,
                n.RestaurantId,
                n.Restaurant.Name,
                ApiEnum.Text(n.Kind),
                n.Change is null ? null : JsonSerializer.Deserialize<SubscriptionChange>(n.Change),
                n.Reason,
                n.Deadline,
                n.Deadline != null && summaries[n.RestaurantId].Renewal?.AwaitingPayment == true,
                n.Deadline == null ? null : summaries[n.RestaurantId].Renewal?.PeriodPaid
            ))
            .ToArray();
        await transaction.CommitAsync(ct);
        return response;
    }

    private static bool IsCurrent(SubscriptionNotice notice, SubscriptionRenewal? renewal) =>
        renewal is not null
        && notice.PeriodId == renewal.PeriodId
        && notice.Deadline == renewal.Deadline
        && notice.Kind == renewal.Kind;

    // OWNER is unique per restaurant. The acknowledgment belongs to that account on every device.
    public Task AcknowledgeOwnerAsync(Guid restaurantId, Guid[] ids, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return db
            .SubscriptionNotices.Where(n =>
                n.RestaurantId == restaurantId
                && n.OwnerAcknowledgedAt == null
                && ids.Contains(n.Id)
            )
            .ExecuteUpdateAsync(update => update.SetProperty(n => n.OwnerAcknowledgedAt, now), ct);
    }

    public Task AcknowledgePlatformAsync(Guid accountId, Guid[] ids, CancellationToken ct) =>
        db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO platform_subscription_receipts (platform_user_id, notice_id)
            SELECT {accountId}, n.id FROM subscription_notices n
            WHERE n.deadline IS NOT NULL AND n.id = ANY({ids})
            ON CONFLICT DO NOTHING
            """,
            ct
        );

    // Persist the current phase only. The unique index also prevents duplicate pushes across API instances.
    public async Task<int> CreateRenewalNoticesAsync(CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var restaurants = await db.Restaurants.AsNoTracking().ToArrayAsync(ct);
        var summaries = await subscriptions.SummariesAsync(restaurants, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var inserted = 0;
        foreach (var restaurant in restaurants)
        {
            if (summaries[restaurant.Id].Renewal is not { } renewal)
                continue;
            var id = Guid.NewGuid();
            var count = await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO subscription_notices (id, restaurant_id, period_id, kind, created_at, deadline)
                SELECT {id}, p.restaurant_id, p.id, {ApiEnum.Text(
                    renewal.Kind
                )}, {now}, {renewal.Deadline}
                FROM restaurant_subscription_periods p
                WHERE p.id = {renewal.PeriodId} AND p.ends_on = {renewal.Deadline}
                ON CONFLICT (period_id, deadline, kind) WHERE deadline IS NOT NULL DO NOTHING
                """,
                ct
            );
            inserted += count;
        }
        await transaction.CommitAsync(ct);
        return inserted;
    }
}
