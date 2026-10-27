using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class ItemProcessingMigrationTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Migrate_LegacyOrders_PreservesSnapshotsAmountsAndHistoricalTimes()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261027070937_AddRestaurantJoinCodeRequired");
        var restaurant = new Restaurant { Name = "Migration", DefaultLanguage = "it" };
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "8", QrToken = Guid.NewGuid().ToString("N") };
        var createdAt = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);
        var readyAt = createdAt.AddMinutes(5);
        var cancelledAt = createdAt.AddMinutes(10);
        var cases = new[] { "NEW", "READY", "CANCELLED", "CANCELLED_AFTER_READY" };
        var ids = new List<(Guid Order, Guid Session, string State)>();
        foreach (var state in cases)
        {
            var cancelled = state.StartsWith("CANCELLED", StringComparison.Ordinal);
            var session = new DiningSession
            {
                Restaurant = restaurant, Table = table, TableLabelSnapshot = "8", OpenedAt = createdAt,
                Status = state == "NEW" ? DiningSessionStatus.Active : DiningSessionStatus.Closed,
                JoinCodeCiphertext = state == "NEW" ? "test-ciphertext" : null,
                ClosedAt = state == "NEW" ? null : createdAt.AddMinutes(20),
                CloseReason = state == "NEW" ? null : cancelled ? SessionCloseReason.Voided : SessionCloseReason.Paid,
                ClosedTotalCents = state == "NEW" ? null : cancelled ? 0 : 2100
            };
            db.DiningSessions.Add(session);
            await db.SaveChangesAsync();
            var orderId = Guid.NewGuid(); var requestId = Guid.NewGuid();
            var oldStatus = cancelled ? "CANCELLED" : state;
            DateTime? oldReady = state is "READY" or "CANCELLED_AFTER_READY" ? readyAt : null;
            DateTime? oldCancelled = cancelled ? cancelledAt : null;
            string? reason = cancelled ? "旧整单原因" : null;
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO orders (id, restaurant_id, dining_session_id, client_request_id, status,
                    total_amount_cents, default_language_snapshot, created_at, ready_at, cancelled_at, cancel_reason)
                VALUES ({orderId}, {restaurant.Id}, {session.Id}, {requestId}, {oldStatus},
                    2100, 'it', {createdAt}, {oldReady}, {oldCancelled}, {reason})
                """);
            foreach (var quantity in new[] { 1, 2 })
            {
                var itemId = Guid.NewGuid();
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO order_items (id, restaurant_id, order_id, name_zh_snapshot, unit_price_cents, quantity, remark)
                    VALUES ({itemId}, {restaurant.Id}, {orderId}, '旧菜名', 700, {quantity}, '少盐')
                    """);
            }
            ids.Add((orderId, session.Id, state));
        }

        // Exercise an already upgraded database as well as the legacy-state backfill.
        await migrator.MigrateAsync("20261027101211_ItemLevelOrderProcessing");
        Assert.Equal(2, await db.Database.SqlQueryRaw<int>(
            "SELECT count(*)::int AS \"Value\" FROM orders WHERE cancel_reason IS NOT NULL").SingleAsync());
        await migrator.MigrateAsync();
        Assert.False(await db.Database.SqlQueryRaw<bool>("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancel_reason'
            ) AS "Value"
            """).SingleAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        foreach (var row in ids)
        {
            var order = await db.Orders.AsNoTracking().Include(o => o.Items).SingleAsync(o => o.Id == row.Order);
            var cancelled = row.State.StartsWith("CANCELLED", StringComparison.Ordinal);
            Assert.Equal(row.State == "NEW" ? OrderStatus.New : OrderStatus.Processed, order.Status);
            Assert.Equal(row.State == "NEW" ? null : cancelled ? cancelledAt : readyAt, order.ProcessedAt);
            Assert.Equal(2100, order.TotalAmountCents);
            Assert.Equal(new[] { 1, 2 }, order.Items.Select(i => i.Quantity).Order());
            Assert.All(order.Items, item =>
            {
                Assert.Equal(cancelled ? OrderItemStatus.Cancelled : row.State == "READY" ? OrderItemStatus.Ready : OrderItemStatus.New, item.Status);
                Assert.Equal(row.State is "READY" or "CANCELLED_AFTER_READY" ? readyAt : null, item.ReadyAt);
                Assert.Equal(cancelled ? cancelledAt : null, item.CancelledAt);
                Assert.Equal("旧菜名", item.NameZhSnapshot); Assert.Equal("少盐", item.Remark);
            });
            var bill = await SessionSummaries.ReadAsync(db, restaurant.Id, row.Session, default);
            Assert.Equal(cancelled ? 0 : 2100, bill.TotalAmountCents);
            Assert.Equal(2, bill.ItemCount); Assert.Equal(cancelled ? 2 : 0, bill.CancelledItemCount);
        }
    }
}
