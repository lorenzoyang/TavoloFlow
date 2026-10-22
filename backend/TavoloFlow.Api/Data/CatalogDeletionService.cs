using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data;

/// <summary>
/// Deletes catalog rows while retaining historical snapshots. Use a fresh scope:
/// bulk updates and deletes do not synchronize previously tracked entities.
/// </summary>
public sealed class CatalogDeletionService(ApplicationDbContext context)
{
    public async Task<CatalogDeletionResult> DeleteMenuItemAsync(
        Guid restaurantId,
        Guid menuItemId,
        CancellationToken cancellationToken = default)
    {
        // a menu edit also updates language metadata. Join its transaction without committing it here.
        await using var transaction = context.Database.CurrentTransaction is null
            ? await context.Database.BeginTransactionAsync(cancellationToken) : null;

        // the row lock also prevents new FK references while we detach existing lines.
        var item = await context.MenuItems.FromSqlInterpolated($"""
            SELECT * FROM menu_items
            WHERE restaurant_id = {restaurantId} AND id = {menuItemId}
            FOR UPDATE
            """).AsNoTracking().SingleOrDefaultAsync(cancellationToken);

        if (item is null)
        {
            return CatalogDeletionResult.NotFound;
        }

        await context.OrderItems
            .Where(line => line.RestaurantId == restaurantId && line.MenuItemId == menuItemId)
            .ExecuteUpdateAsync(update => update.SetProperty(line => line.MenuItemId, (Guid?)null), cancellationToken);

        await context.MenuItems
            .Where(menuItem => menuItem.RestaurantId == restaurantId && menuItem.Id == menuItemId)
            .ExecuteDeleteAsync(cancellationToken);

        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        return CatalogDeletionResult.Deleted;
    }

    public async Task<CatalogDeletionResult> DeleteRestaurantTableAsync(
        Guid restaurantId,
        Guid tableId,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        // the row lock also prevents new FK references while we detach existing lines.
        var table = await context.RestaurantTables.FromSqlInterpolated($"""
            SELECT * FROM restaurant_tables
            WHERE restaurant_id = {restaurantId} AND id = {tableId}
            FOR UPDATE
            """).AsNoTracking().SingleOrDefaultAsync(cancellationToken);

        if (table is null)
        {
            return CatalogDeletionResult.NotFound;
        }

        if (await context.DiningSessions.AnyAsync(session =>
                session.RestaurantId == restaurantId && session.TableId == tableId &&
                session.Status == DiningSessionStatus.Active, cancellationToken))
        {
            return CatalogDeletionResult.TableHasActiveSession;
        }

        await context.DiningSessions
            .Where(session => session.RestaurantId == restaurantId && session.TableId == tableId &&
                session.Status == DiningSessionStatus.Closed)
            .ExecuteUpdateAsync(update => update.SetProperty(session => session.TableId, (Guid?)null), cancellationToken);

        await context.RestaurantTables
            .Where(restaurantTable => restaurantTable.RestaurantId == restaurantId && restaurantTable.Id == tableId)
            .ExecuteDeleteAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return CatalogDeletionResult.Deleted;
    }
}
