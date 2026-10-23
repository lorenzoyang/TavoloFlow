using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data;

public enum CatalogDeletionResult
{
    Deleted,
    NotFound,
    TableHasActiveSession
}

/// <summary>
/// Deletes catalog rows while retaining historical snapshots. Each method owns its transaction, so never
/// wrap a call in another one. Use a fresh scope: bulk updates and deletes do not synchronize previously
/// tracked entities.
/// </summary>
public sealed class CatalogDeletionService(ApplicationDbContext context)
{
    public async Task<CatalogDeletionResult> DeleteMenuItemAsync(
        Guid restaurantId,
        Guid menuItemId,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        // Match the menu writers' lock order so deletion cannot race a content edit or a new order's snapshot.
        if (await RowLocks.RestaurantAsync(context, restaurantId, RowLock.Update, cancellationToken) is null)
        {
            return CatalogDeletionResult.NotFound;
        }

        // The row lock also prevents new FK references while we detach existing lines.
        if (await RowLocks.MenuItemAsync(context, restaurantId, menuItemId, RowLock.Update, cancellationToken) is null)
        {
            return CatalogDeletionResult.NotFound;
        }

        await context.OrderItems
            .Where(line => line.RestaurantId == restaurantId && line.MenuItemId == menuItemId)
            .ExecuteUpdateAsync(update => update.SetProperty(line => line.MenuItemId, (Guid?)null), cancellationToken);

        await context.MenuItems
            .Where(menuItem => menuItem.RestaurantId == restaurantId && menuItem.Id == menuItemId)
            .ExecuteDeleteAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return CatalogDeletionResult.Deleted;
    }

    public async Task<CatalogDeletionResult> DeleteRestaurantTableAsync(
        Guid restaurantId,
        Guid tableId,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        // The same table UPDATE lock as opening, so a table cannot be deleted while a session is being opened.
        if (await RowLocks.TableAsync(context, restaurantId, tableId, RowLock.Update, cancellationToken) is null)
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
