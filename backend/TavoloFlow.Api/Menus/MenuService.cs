using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

public sealed class MenuService(ApplicationDbContext context, CatalogDeletionService deletion)
{
    public async Task<MenuResponse> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        // All queries see the same committed menu, even when another request edits it.
        await using var transaction = await context.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var defaultLanguage = await context.Restaurants.Where(x => x.Id == restaurantId)
            .Select(x => x.DefaultLanguage).SingleAsync(ct);
        var menu = await MenuReader.ReadAsync(context, restaurantId, defaultLanguage, ct);
        await transaction.CommitAsync(ct);
        return menu;
    }

    public Task<CategoryResponse> SaveCategoryAsync(Guid restaurantId, Guid? id, CategoryInput input, CancellationToken ct)
    {
        var value = MenuValidation.Normalize(input);
        return WriteAsync(restaurantId, async () =>
        {
            var category = id is null ? new MenuCategory { RestaurantId = restaurantId } :
                await context.MenuCategories.SingleOrDefaultAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct)
                    ?? throw MenuErrors.NotFound();
            category.NameZh = value.NameZh;
            category.NameIt = value.NameIt;
            category.NameEn = value.NameEn;
            if (id is null) context.MenuCategories.Add(category);
            await context.SaveChangesAsync(ct);
            return CategoryResponse.From(category);
        }, ct);
    }

    public Task DeleteCategoryAsync(Guid restaurantId, Guid id, CancellationToken ct) => WriteAsync(restaurantId, async () =>
    {
        if (!await context.MenuCategories.AnyAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct))
            throw MenuErrors.NotFound();
        if (await context.MenuItems.AnyAsync(x => x.RestaurantId == restaurantId && x.CategoryId == id, ct))
            throw new ApiException(409, "CATEGORY_NOT_EMPTY", "请先移走或删除分类中的菜品。");
        await context.MenuCategories.Where(x => x.RestaurantId == restaurantId && x.Id == id).ExecuteDeleteAsync(ct);
    }, ct);

    public Task<MenuItemResponse> SaveItemAsync(Guid restaurantId, Guid? id, MenuItemInput input, CancellationToken ct)
    {
        var value = MenuValidation.Normalize(input);
        return WriteAsync(restaurantId, async () =>
        {
            var item = id is null ? new MenuItem { RestaurantId = restaurantId, IsAvailable = true } :
                await context.MenuItems.SingleOrDefaultAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct)
                    ?? throw MenuErrors.NotFound();
            if (!await context.MenuCategories.AnyAsync(x => x.RestaurantId == restaurantId && x.Id == value.CategoryId, ct))
                throw MenuErrors.NotFound();
            item.CategoryId = value.CategoryId;
            item.ItemCode = value.ItemCode;
            item.NameZh = value.NameZh;
            item.NameIt = value.NameIt;
            item.NameEn = value.NameEn;
            item.DescriptionZh = value.DescriptionZh;
            item.DescriptionIt = value.DescriptionIt;
            item.DescriptionEn = value.DescriptionEn;
            item.PriceCents = value.PriceCents;
            item.AllergenCodes = value.AllergenCodes!;
            item.AllergenReviewed = true;
            // Never copy availability from a content-edit form.
            if (id is null) context.MenuItems.Add(item);
            await context.SaveChangesAsync(ct);
            return MenuItemResponse.From(item);
        }, ct);
    }

    public async Task DeleteItemAsync(Guid restaurantId, Guid id, CancellationToken ct)
    {
        if (await deletion.DeleteMenuItemAsync(restaurantId, id, ct) == CatalogDeletionResult.NotFound)
            throw MenuErrors.NotFound();
    }

    public Task<MenuItemResponse> SetAvailabilityAsync(Guid restaurantId, Guid id, bool available, CancellationToken ct) =>
        WriteAsync(restaurantId, async () =>
        {
            var item = await context.MenuItems.AsNoTracking()
                .SingleOrDefaultAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct) ?? throw MenuErrors.NotFound();
            if (available && !item.AllergenReviewed)
                throw new ApiException(409, "ALLERGEN_REVIEW_REQUIRED", "请先由老板编辑菜品并完成过敏原审核。");
            await context.MenuItems.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.IsAvailable, available), ct);
            item.IsAvailable = available;
            return MenuItemResponse.From(item);
        }, ct);

    public async Task<DefaultLanguageResponse> SetDefaultLanguageAsync(Guid restaurantId, string? language, CancellationToken ct)
    {
        if (!InputRules.IsLanguage(language))
            throw ApiException.Validation("请选择中文、意大利语或英语。", "defaultLanguage", "语言代码必须为 zh、it 或 en。");
        var updated = await context.Restaurants.Where(x => x.Id == restaurantId)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.DefaultLanguage, language), ct);
        if (updated == 0) throw MenuErrors.NotFound();
        return new(language);
    }

    private Task WriteAsync(Guid restaurantId, Func<Task> operation, CancellationToken ct) =>
        WriteAsync(restaurantId, async () => { await operation(); return true; }, ct);

    private async Task<T> WriteAsync<T>(Guid restaurantId, Func<Task<T>> operation, CancellationToken ct)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(ct);
        // Every menu write locks the restaurant row first, then categories/items: last write wins without a
        // menu version column, and order creation (restaurant SHARE) never sees a half-saved menu.
        if (await RowLocks.RestaurantAsync(context, restaurantId, RowLock.Update, ct) is null) throw MenuErrors.NotFound();
        try
        {
            var result = await operation();
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException
        { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "uq_menu_items_code" })
        {
            throw new ApiException(409, "ITEM_CODE_CONFLICT", "该菜品编号已被本店其他菜品使用。",
                new Dictionary<string, string[]> { ["itemCode"] = ["请使用不同编号，或留空。"] });
        }
    }
}
