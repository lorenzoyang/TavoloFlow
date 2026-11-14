using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

// The restaurant and table behind a QR code or a guest's authorization.
public static class DiningEntrance
{
    // SHARE locks let concurrent guests of the restaurant proceed together, while menu writers and
    // table maintenance (UPDATE) wait until this transaction ends. Call before any session lock.
    public static async Task<(Restaurant Restaurant, RestaurantTable Table)> LockAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        Guid tableId,
        CancellationToken ct
    )
    {
        var restaurant =
            await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        var table =
            await RowLocks.TableAsync(db, restaurantId, tableId, RowLock.Share, ct)
            ?? throw DiningErrors.TableNotFound();
        return (restaurant, table);
    }

    // A suspended restaurant, dine-in that the platform has not turned on, or a disabled table stops new
    // sessions, guest joins, guest code reads and QR orders. OrderingEnabled gates future orders only,
    // not seating or joining a session.
    public static void Require(Restaurant restaurant, RestaurantTable table)
    {
        if (restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            throw new ApiException(
                409,
                "SERVICE_SUSPENDED",
                "The restaurant's service is suspended."
            );
        if (!restaurant.DineInEnabled)
            throw DiningErrors.DineInNotOffered();
        if (!table.IsEnabled)
            throw new ApiException(409, "TABLE_DISABLED", "This table is disabled. Ask the staff.");
    }
}
