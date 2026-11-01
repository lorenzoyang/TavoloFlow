using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data;

public enum RowLock
{
    // FOR SHARE: blocks writers of the row but admits other SHARE holders, so readers do not serialize.
    Share,
    // FOR UPDATE: exclusive; waits for and blocks every SHARE and UPDATE holder.
    Update
}

// PostgreSQL row locks, held until the caller's transaction ends; call them only inside a transaction you own.
// Every operation locks in one global order so that no two transactions can deadlock:
//   restaurant -> table -> dining session, restaurant -> menu item,
//   restaurant -> pickup submission advisory lock -> pickup counter, and restaurant -> pickup request (acceptance; rejection
//   locks only the request). A session created by an acceptance is new, so nothing else holds it yet.
// Each method returns a no-tracking snapshot of the locked row, or null when the tenant has no such row.
public static class RowLocks
{
    // A stable gate across business dates. Daily counter rows alone cannot serialize two submissions
    // on opposite sides of midnight. Hash collisions only serialize unrelated restaurants harmlessly.
    public static Task PickupSubmissionAsync(ApplicationDbContext db, Guid restaurantId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({"tavoloflow:pickup-submit:" + restaurantId.ToString("D")}, 0))", ct);

    public static Task<Restaurant?> RestaurantAsync(ApplicationDbContext db, Guid id, RowLock mode,
        CancellationToken ct) =>
        (mode == RowLock.Share
            ? db.Restaurants.FromSql($"SELECT * FROM restaurants WHERE id = {id} FOR SHARE")
            : db.Restaurants.FromSql($"SELECT * FROM restaurants WHERE id = {id} FOR UPDATE"))
        .AsNoTracking().SingleOrDefaultAsync(ct);

    public static Task<RestaurantTable?> TableAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        RowLock mode, CancellationToken ct) =>
        (mode == RowLock.Share
            ? db.RestaurantTables.FromSql(
                $"SELECT * FROM restaurant_tables WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE")
            : db.RestaurantTables.FromSql(
                $"SELECT * FROM restaurant_tables WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE"))
        .AsNoTracking().SingleOrDefaultAsync(ct);

    public static Task<DiningSession?> SessionAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        RowLock mode, CancellationToken ct) =>
        (mode == RowLock.Share
            ? db.DiningSessions.FromSql(
                $"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE")
            : db.DiningSessions.FromSql(
                $"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE"))
        .AsNoTracking().SingleOrDefaultAsync(ct);

    public static Task<PickupRequest?> PickupRequestAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        RowLock mode, CancellationToken ct) =>
        (mode == RowLock.Share
            ? db.PickupRequests.FromSql(
                $"SELECT * FROM pickup_requests WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE")
            : db.PickupRequests.FromSql(
                $"SELECT * FROM pickup_requests WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE"))
        .AsNoTracking().SingleOrDefaultAsync(ct);

    public static Task<MenuItem?> MenuItemAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        RowLock mode, CancellationToken ct) =>
        (mode == RowLock.Share
            ? db.MenuItems.FromSql(
                $"SELECT * FROM menu_items WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE")
            : db.MenuItems.FromSql(
                $"SELECT * FROM menu_items WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE"))
        .AsNoTracking().SingleOrDefaultAsync(ct);
}
