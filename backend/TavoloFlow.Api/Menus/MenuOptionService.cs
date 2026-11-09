using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

// The restaurant's shared option library. Every write takes the same restaurant UPDATE lock as the other menu
// writes, so an order (restaurant SHARE) always prices and snapshots a consistent menu.
public sealed class MenuOptionService(ApplicationDbContext context)
{
    public Task<OptionGroupResponse> SaveGroupAsync(
        Guid restaurantId,
        Guid? id,
        OptionGroupInput input,
        CancellationToken ct
    )
    {
        var value = MenuValidation.Normalize(input);
        return MenuWrites.RunAsync(
            context,
            restaurantId,
            async () =>
            {
                var groups = context.MenuOptionGroups.Where(x => x.RestaurantId == restaurantId);
                MenuOptionGroup group;
                if (id is null)
                {
                    if (await groups.CountAsync(ct) >= MenuValidation.MaxOptionGroups)
                        throw ApiException.Validation(
                            "Check the menu content.",
                            "optionGroups",
                            $"A restaurant can have at most {MenuValidation.MaxOptionGroups} option groups."
                        );
                    // New groups come last in the restaurant-wide order.
                    var last = await groups.MaxAsync(x => (int?)x.Position, ct) ?? -1;
                    group = new MenuOptionGroup
                    {
                        RestaurantId = restaurantId,
                        Position = last + 1,
                    };
                    context.MenuOptionGroups.Add(group);
                }
                else
                    group =
                        await groups
                            .Include(x => x.Options)
                            .SingleOrDefaultAsync(x => x.Id == id, ct)
                        ?? throw MenuErrors.NotFound();
                group.NameZh = value.NameZh;
                group.NameIt = value.NameIt;
                group.NameEn = value.NameEn;
                group.MinSelect = value.MinSelect;
                group.MaxSelect = value.MaxSelect;

                var existing = group.Options.ToDictionary(x => x.Id);
                var inputs = value.Options!.Select(x => x!).ToArray();
                if (inputs.Any(x => x.Id is Guid optionId && !existing.ContainsKey(optionId)))
                    throw MenuErrors.NotFound();
                var kept = inputs.Select(x => x.Id).OfType<Guid>().ToHashSet();
                foreach (var removed in existing.Values.Where(x => !kept.Contains(x.Id)))
                    context.MenuOptions.Remove(removed);
                var saved = new List<MenuOption>();
                foreach (var (option, index) in inputs.Select((x, i) => (x, i)))
                {
                    // An edit never copies availability: only the sold-out switch changes it.
                    var entity = option.Id is Guid optionId
                        ? existing[optionId]
                        : new MenuOption { RestaurantId = restaurantId, IsAvailable = true };
                    entity.NameZh = option.NameZh;
                    entity.NameIt = option.NameIt;
                    entity.NameEn = option.NameEn;
                    entity.PriceDeltaCents = option.PriceDeltaCents;
                    entity.AllergenCodes = option.AllergenCodes!;
                    entity.Position = index;
                    if (option.Id is null)
                        group.Options.Add(entity);
                    saved.Add(entity);
                }

                var itemIds = value.MenuItemIds!;
                if (
                    itemIds.Length > 0
                    && await context.MenuItems.CountAsync(
                        x => x.RestaurantId == restaurantId && itemIds.Contains(x.Id),
                        ct
                    ) != itemIds.Length
                )
                    throw MenuErrors.NotFound();
                await context.SaveChangesAsync(ct);
                await context
                    .MenuItemOptionGroups.Where(x =>
                        x.RestaurantId == restaurantId && x.GroupId == group.Id
                    )
                    .ExecuteDeleteAsync(ct);
                context.MenuItemOptionGroups.AddRange(
                    itemIds.Select(itemId => new MenuItemOptionGroup
                    {
                        MenuItemId = itemId,
                        GroupId = group.Id,
                        RestaurantId = restaurantId,
                    })
                );
                await context.SaveChangesAsync(ct);
                // Checked after writing, inside the uncommitted transaction, which a rejection rolls back.
                if (
                    itemIds.Length > 0
                    && await context
                        .MenuItemOptionGroups.Where(x =>
                            x.RestaurantId == restaurantId && itemIds.Contains(x.MenuItemId)
                        )
                        .GroupBy(x => x.MenuItemId)
                        .AnyAsync(x => x.Count() > MenuValidation.MaxGroupsPerItem, ct)
                )
                    throw ApiException.Validation(
                        "Check the menu content.",
                        "menuItemIds",
                        $"A dish can use at most {MenuValidation.MaxGroupsPerItem} option groups."
                    );
                return OptionGroupResponse.From(group, saved);
            },
            ct
        );
    }

    // Options and links go with the group through the database's ON DELETE CASCADE; orders keep their snapshots.
    public Task DeleteGroupAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        MenuWrites.RunAsync(
            context,
            restaurantId,
            async () =>
            {
                if (
                    await context
                        .MenuOptionGroups.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                        .ExecuteDeleteAsync(ct) == 0
                )
                    throw MenuErrors.NotFound();
                return true;
            },
            ct
        );

    // The request lists every group in its new order, so repeating it changes nothing; a list made from an
    // outdated menu is rejected instead of guessing where missing or extra groups belong.
    public Task ReorderGroupsAsync(Guid restaurantId, Guid[]? groupIds, CancellationToken ct) =>
        MenuWrites.RunAsync(
            context,
            restaurantId,
            async () =>
            {
                var current = await context
                    .MenuOptionGroups.Where(x => x.RestaurantId == restaurantId)
                    .Select(x => x.Id)
                    .ToArrayAsync(ct);
                if (
                    groupIds is null
                    || groupIds.Length != current.Length
                    || !groupIds.ToHashSet().SetEquals(current)
                )
                    throw MenuErrors.OptionGroupsChanged();
                foreach (var (groupId, position) in groupIds.Select((x, i) => (x, i)))
                    await context
                        .MenuOptionGroups.Where(x =>
                            x.RestaurantId == restaurantId && x.Id == groupId
                        )
                        .ExecuteUpdateAsync(u => u.SetProperty(x => x.Position, position), ct);
                return true;
            },
            ct
        );

    public Task<OptionResponse> SetAvailabilityAsync(
        Guid restaurantId,
        Guid id,
        bool available,
        CancellationToken ct
    ) =>
        MenuWrites.RunAsync(
            context,
            restaurantId,
            async () =>
            {
                var option =
                    await context
                        .MenuOptions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct)
                    ?? throw MenuErrors.NotFound();
                await context
                    .MenuOptions.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                    .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsAvailable, available), ct);
                option.IsAvailable = available;
                return OptionResponse.From(option);
            },
            ct
        );
}
