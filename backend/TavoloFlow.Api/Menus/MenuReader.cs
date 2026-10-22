using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Menus;

// The caller owns a Repeatable Read transaction, including any restaurant/table reads.
internal static class MenuReader
{
    public static async Task<MenuResponse> ReadAsync(ApplicationDbContext context, Guid restaurantId,
        string defaultLanguage, CancellationToken ct)
    {
        var categories = await context.MenuCategories.AsNoTracking().Where(x => x.RestaurantId == restaurantId)
            .OrderBy(x => x.Id).ToArrayAsync(ct);
        var items = await context.MenuItems.AsNoTracking().Where(x => x.RestaurantId == restaurantId)
            .OrderBy(x => x.CategoryId).ThenBy(x => x.Id).ToArrayAsync(ct);
        var names = categories.Select(x => new { x.NameZh, x.NameIt, x.NameEn })
            .Concat(items.Select(x => new { x.NameZh, x.NameIt, x.NameEn })).ToArray();
        var present = new[] { names.Any(x => !string.IsNullOrWhiteSpace(x.NameZh)),
            names.Any(x => !string.IsNullOrWhiteSpace(x.NameIt)), names.Any(x => !string.IsNullOrWhiteSpace(x.NameEn)) };
        var languages = new[] { "zh", "it", "en" }.Where((_, index) => present[index]).ToArray();
        return new(restaurantId, defaultLanguage, languages,
            categories.Select(CategoryResponse.From).ToArray(), items.Select(MenuItemResponse.From).ToArray(), MenuAllergens.Options);
    }
}
