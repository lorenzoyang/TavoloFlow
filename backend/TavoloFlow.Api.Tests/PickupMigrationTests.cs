using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class PickupMigrationTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Migrate_PrePickupDatabase_PreservesActiveAndDetachedDineInHistory()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261029204020_MarkServedAtClosure");
        var restaurant = Guid.NewGuid(); var table = Guid.NewGuid(); var active = Guid.NewGuid(); var closed = Guid.NewGuid();
        var at = new DateTime(2026, 10, 29, 12, 0, 0, DateTimeKind.Utc);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO restaurants (id, name, default_language) VALUES ({restaurant}, 'Legacy', 'it')");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO restaurant_tables (id, restaurant_id, table_label, qr_token) VALUES ({table}, {restaurant}, '8', {Guid.NewGuid().ToString("N")})");
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO dining_sessions (id, restaurant_id, table_id, table_label_snapshot, join_code_ciphertext, opened_at)
            VALUES ({active}, {restaurant}, {table}, '8', 'legacy-ciphertext', {at})
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO dining_sessions (id, restaurant_id, table_id, table_label_snapshot, status, opened_at,
                closed_at, close_reason, closed_total_cents)
            VALUES ({closed}, {restaurant}, NULL, 'Deleted table', 'CLOSED', {at}, {at.AddHours(1)}, 'EMPTY', 0)
            """);
        await migrator.MigrateAsync();
        var store = await db.Restaurants.AsNoTracking().SingleAsync();
        Assert.True(store.DineInEnabled); Assert.False(store.PickupEnabled);
        var rows = await db.DiningSessions.AsNoTracking().ToArrayAsync();
        Assert.All(rows, row => Assert.Equal(SessionChannel.DineIn, row.Channel));
        var open = Assert.Single(rows, row => row.Id == active);
        Assert.Equal((table, "8", "legacy-ciphertext", 1), (open.TableId, open.TableLabelSnapshot, open.JoinCodeCiphertext, open.BillVersion));
        var history = Assert.Single(rows, row => row.Id == closed);
        Assert.Null(history.TableId); Assert.Equal("Deleted table", history.TableLabelSnapshot);
        Assert.Equal((SessionCloseReason.Empty, 0L, at.AddHours(1)), (history.CloseReason, history.ClosedTotalCents, history.ClosedAt));
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task Migrate_ValidAcceptedRequest_RequiresEveryAcceptanceFieldAfterUpgrade()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261031194426_PickupClosure");
        var restaurant = new Restaurant { Name = "Pickup migration", DefaultLanguage = "it" };
        var at = new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc);
        var session = new DiningSession { Restaurant = restaurant, Channel = SessionChannel.Pickup, OpenedAt = at };
        var request = new PickupRequest { Restaurant = restaurant, Session = session, ClientRequestId = Guid.NewGuid(),
            StatusToken = Guid.NewGuid().ToString("N"), BusinessDate = new(2026, 11, 1), PickupNumber = 1,
            CustomerName = "Marco", CustomerPhone = "3331234567", DefaultLanguageSnapshot = "it", TotalAmountCents = 700,
            SubmittedAt = at, ExpiresAt = at.AddMinutes(10), AcceptedAt = at.AddMinutes(1), EstimatedReadyAt = at.AddMinutes(20) };
        db.PickupRequests.Add(request); await db.SaveChangesAsync();
        await migrator.MigrateAsync();
        Assert.Equal(at.AddMinutes(20), await db.PickupRequests.Select(r => r.EstimatedReadyAt).SingleAsync());
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.PickupRequests
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.EstimatedReadyAt, (DateTime?)null)));
        Assert.Equal("ck_pickup_request_acceptance", error.ConstraintName);
    }
}
