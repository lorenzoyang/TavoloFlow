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
        var languages = InputRules
            .Languages.Where((_, i) => names.Any(name => !string.IsNullOrWhiteSpace(name[i])))
            .ToArray();
        return new(
            restaurantId,
            defaultLanguage,
            languages,
            categories.Select(CategoryResponse.From).ToArray(),
            items.Select(MenuItemResponse.From).ToArray(),
            MenuAllergens.Options
        );
    }
}
