using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Menus;

internal static class MenuWrites
{
    // Every menu write (dishes, categories, option groups and options) locks the restaurant row first, then
    // its menu rows: last write wins without a menu version column, and order creation (restaurant SHARE)
    // never sees a half-saved menu.
    public static async Task<T> RunAsync<T>(
        ApplicationDbContext context,
        Guid restaurantId,
        Func<Task<T>> operation,
        CancellationToken ct
    )
    {
        await using var transaction = await context.Database.BeginTransactionAsync(ct);
        if (await RowLocks.RestaurantAsync(context, restaurantId, RowLock.Update, ct) is null)
            throw MenuErrors.NotFound();
        var result = await operation();
        await transaction.CommitAsync(ct);
        return result;
    }

    // A dish's option groups in the restaurant-wide group order.
    public static Task<Guid[]> GroupIdsAsync(
        ApplicationDbContext context,
        Guid restaurantId,
        Guid itemId,
        CancellationToken ct
    ) =>
        context
            .MenuItemOptionGroups.Where(link =>
                link.RestaurantId == restaurantId && link.MenuItemId == itemId
            )
            .Join(context.MenuOptionGroups, link => link.GroupId, group => group.Id, (_, g) => g)
            .OrderBy(group => group.Position)
            .ThenBy(group => group.Id)
            .Select(group => group.Id)
            .ToArrayAsync(ct);
}
