using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

// Call only inside an owned transaction. Order: restaurant -> table -> session.
// Shared entrance locks coordinate with ordinary UPDATE/DELETE without serializing guest readers.
public static class DiningLocks
{
    public static async Task<Restaurant> RestaurantAsync(ApplicationDbContext db, Guid id, CancellationToken ct) =>
        await db.Restaurants.FromSqlInterpolated($"SELECT * FROM restaurants WHERE id = {id} FOR SHARE")
            .AsNoTracking().SingleOrDefaultAsync(ct) ?? throw DiningErrors.RestaurantNotFound();

    public static async Task<RestaurantTable> TableAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        bool forUpdate, CancellationToken ct)
    {
        var query = forUpdate
            ? db.RestaurantTables.FromSqlInterpolated($"SELECT * FROM restaurant_tables WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE")
            : db.RestaurantTables.FromSqlInterpolated($"SELECT * FROM restaurant_tables WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE");
        return await query.AsNoTracking().SingleOrDefaultAsync(ct)
            ?? throw DiningErrors.TableNotFound();
    }

    public static async Task<DiningSession> SessionAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        bool forUpdate, CancellationToken ct)
    {
        var query = forUpdate
            ? db.DiningSessions.FromSqlInterpolated($"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE")
            : db.DiningSessions.FromSqlInterpolated($"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR SHARE");
        return await query.AsNoTracking().SingleOrDefaultAsync(ct) ?? throw DiningErrors.SessionNotFound();
    }

    public static void RequireEntrance(Restaurant restaurant, RestaurantTable table)
    {
        if (restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            throw new ApiException(409, "SERVICE_SUSPENDED", "餐厅服务已暂停。");
        if (!table.IsEnabled)
            throw new ApiException(409, "TABLE_DISABLED", "此桌已停用，请联系工作人员。");
        // OrderingEnabled gates future orders, not seating or joining a session.
    }
}
