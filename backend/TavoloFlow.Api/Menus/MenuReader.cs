using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Menus;

// The caller owns a Repeatable Read transaction, including any restaurant/table reads.
internal static class MenuReader
{
    public static async Task<MenuResponse> ReadAsync(
        ApplicationDbContext context,
        Guid restaurantId,
        string defaultLanguage,
        CancellationToken ct
    )
    {
        var categories = await context
            .MenuCategories.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId)
            .OrderBy(x => x.Id)
            .ToArrayAsync(ct);
        var items = await context
            .MenuItems.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId)
            .OrderBy(x => x.CategoryId)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        // Each name array follows InputRules.Languages order: zh, it, en. This is a content statistic only;
        // it never restricts the default language or the guest's language choice.
        string?[][] names =
        [
            .. categories.Select(x => new[] { x.NameZh, x.NameIt, x.NameEn }),
            .. items.Select(x => new[] { x.NameZh, x.NameIt, x.NameEn }),
        ];
        var groups = await context
            .MenuOptionGroups.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId)
            .OrderBy(x => x.Position)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        var options = (
            await context
                .MenuOptions.AsNoTracking()
                .Where(x => x.RestaurantId == restaurantId)
                .ToArrayAsync(ct)
        ).ToLookup(x => x.GroupId);
        var rank = groups.Select((group, index) => (group.Id, index)).ToDictionary();
        var links = (
            await context
                .MenuItemOptionGroups.AsNoTracking()
                .Where(x => x.RestaurantId == restaurantId)
                .ToArrayAsync(ct)
        ).ToLookup(x => x.MenuItemId, x => x.GroupId);
        // Option names don't count: they never decide which languages a guest can choose either.
        var languages = InputRules
            .Languages.Where((_, i) => names.Any(name => !string.IsNullOrWhiteSpace(name[i])))
            .ToArray();
        return new(
            restaurantId,
            defaultLanguage,
            languages,
            categories.Select(CategoryResponse.From).ToArray(),
            items
                .Select(x =>
                    MenuItemResponse.From(x, links[x.Id].OrderBy(id => rank[id]).ToArray())
                )
                .ToArray(),
            groups.Select(x => OptionGroupResponse.From(x, options[x.Id])).ToArray(),
            MenuAllergens.Options
        );
    }
}
