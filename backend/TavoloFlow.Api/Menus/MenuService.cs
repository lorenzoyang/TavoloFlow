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
        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var defaultLanguage = await context
            .Restaurants.Where(x => x.Id == restaurantId)
            .Select(x => x.DefaultLanguage)
            .SingleAsync(ct);
        var menu = await MenuReader.ReadAsync(context, restaurantId, defaultLanguage, ct);
        await transaction.CommitAsync(ct);
        return menu;
    }

    public Task<CategoryResponse> SaveCategoryAsync(
        Guid restaurantId,
        Guid? id,
        CategoryInput input,
        CancellationToken ct
    )
    {
        var value = MenuValidation.Normalize(input);
        return WriteAsync(
            restaurantId,
            async () =>
            {
                var category = id is null
                    ? new MenuCategory { RestaurantId = restaurantId }
                    : await context.MenuCategories.SingleOrDefaultAsync(
                        x => x.RestaurantId == restaurantId && x.Id == id,
                        ct
                    ) ?? throw MenuErrors.NotFound();
                category.NameZh = value.NameZh;
                category.NameIt = value.NameIt;
                category.NameEn = value.NameEn;
                if (id is null)
                    context.MenuCategories.Add(category);
                await context.SaveChangesAsync(ct);
                return CategoryResponse.From(category);
            },
            ct
        );
    }

    public Task DeleteCategoryAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        WriteAsync(
            restaurantId,
            async () =>
            {
                if (
                    !await context.MenuCategories.AnyAsync(
                        x => x.RestaurantId == restaurantId && x.Id == id,
                        ct
                    )
                )
                    throw MenuErrors.NotFound();
                if (
                    await context.MenuItems.AnyAsync(
                        x => x.RestaurantId == restaurantId && x.CategoryId == id,
                        ct
                    )
                )
                    throw new ApiException(
                        409,
                        "CATEGORY_NOT_EMPTY",
                        "Move or delete the dishes in this category first."
                    );
                await context
                    .MenuCategories.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                    .ExecuteDeleteAsync(ct);
            },
            ct
        );

    public Task<MenuItemResponse> SaveItemAsync(
        Guid restaurantId,
        Guid? id,
        MenuItemInput input,
        CancellationToken ct
    )
    {
        var value = MenuValidation.Normalize(input);
        return WriteAsync(
            restaurantId,
            async () =>
            {
                var item = id is null
                    ? new MenuItem { RestaurantId = restaurantId, IsAvailable = true }
                    : await context.MenuItems.SingleOrDefaultAsync(
                        x => x.RestaurantId == restaurantId && x.Id == id,
                        ct
                    ) ?? throw MenuErrors.NotFound();
                if (
                    !await context.MenuCategories.AnyAsync(
                        x => x.RestaurantId == restaurantId && x.Id == value.CategoryId,
                        ct
                    )
                )
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
                if (id is null)
                    context.MenuItems.Add(item);
                var groupIds = value.OptionGroupIds!;
                if (
                    groupIds.Length > 0
                    && await context.MenuOptionGroups.CountAsync(
                        x => x.RestaurantId == restaurantId && groupIds.Contains(x.Id),
                        ct
                    ) != groupIds.Length
                )
                    throw MenuErrors.NotFound();
                await context.SaveChangesAsync(ct);
                await context
                    .MenuItemOptionGroups.Where(x =>
                        x.RestaurantId == restaurantId && x.MenuItemId == item.Id
                    )
                    .ExecuteDeleteAsync(ct);
                context.MenuItemOptionGroups.AddRange(
                    groupIds.Select(groupId => new MenuItemOptionGroup
                    {
                        MenuItemId = item.Id,
                        GroupId = groupId,
                        RestaurantId = restaurantId,
                    })
                );
                await context.SaveChangesAsync(ct);
                return MenuItemResponse.From(
                    item,
                    await MenuWrites.GroupIdsAsync(context, restaurantId, item.Id, ct)
                );
            },
            ct
        );
    }

    public async Task DeleteItemAsync(Guid restaurantId, Guid id, CancellationToken ct)
    {
        if (
            await deletion.DeleteMenuItemAsync(restaurantId, id, ct)
            == CatalogDeletionResult.NotFound
        )
            throw MenuErrors.NotFound();
    }

    public Task<MenuItemResponse> SetAvailabilityAsync(
        Guid restaurantId,
        Guid id,
        bool available,
        CancellationToken ct
    ) =>
        WriteAsync(
            restaurantId,
            async () =>
            {
                var item =
                    await context
                        .MenuItems.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.RestaurantId == restaurantId && x.Id == id, ct)
                    ?? throw MenuErrors.NotFound();
                if (available && !item.AllergenReviewed)
                    throw new ApiException(
                        409,
                        "ALLERGEN_REVIEW_REQUIRED",
                        "The owner must first edit the dish and review its allergens."
                    );
                await context
                    .MenuItems.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                    .ExecuteUpdateAsync(
                        update => update.SetProperty(x => x.IsAvailable, available),
                        ct
                    );
                item.IsAvailable = available;
                return MenuItemResponse.From(
                    item,
                    await MenuWrites.GroupIdsAsync(context, restaurantId, id, ct)
                );
            },
            ct
        );

    // Image writes are separate from content saves, so changing a photo never asks for allergen review again.
    public async Task<MenuItemResponse> SetItemImageAsync(
        Guid restaurantId,
        Guid id,
        Stream body,
        long? length,
        CancellationToken ct
    )
    {
        var content = await MenuImages.EncodeAsync(body, length, ct);
        return await WriteAsync(
            restaurantId,
            async () =>
            {
                var item =
                    await context.MenuItems.SingleOrDefaultAsync(
                        x => x.RestaurantId == restaurantId && x.Id == id,
                        ct
                    ) ?? throw MenuErrors.NotFound();
                // A new id per upload keeps every image URL immutable; the replaced URL starts returning 404.
                await context.MenuItemImages.Where(x => x.MenuItemId == id).ExecuteDeleteAsync(ct);
                var image = new MenuItemImage
                {
                    Id = Guid.NewGuid(),
                    MenuItemId = id,
                    Content = content,
                };
                context.MenuItemImages.Add(image);
                item.ImageId = image.Id;
                await context.SaveChangesAsync(ct);
                return MenuItemResponse.From(
                    item,
                    await MenuWrites.GroupIdsAsync(context, restaurantId, id, ct)
                );
            },
            ct
        );
    }

    public Task<MenuItemResponse> DeleteItemImageAsync(
        Guid restaurantId,
        Guid id,
        CancellationToken ct
    ) =>
        WriteAsync(
            restaurantId,
            async () =>
            {
                var item =
                    await context.MenuItems.SingleOrDefaultAsync(
                        x => x.RestaurantId == restaurantId && x.Id == id,
                        ct
                    ) ?? throw MenuErrors.NotFound();
                await context.MenuItemImages.Where(x => x.MenuItemId == id).ExecuteDeleteAsync(ct);
                item.ImageId = null;
                await context.SaveChangesAsync(ct);
                return MenuItemResponse.From(
                    item,
                    await MenuWrites.GroupIdsAsync(context, restaurantId, id, ct)
                );
            },
            ct
        );

    public async Task<DefaultLanguageResponse> SetDefaultLanguageAsync(
        Guid restaurantId,
        string? language,
        CancellationToken ct
    )
    {
        if (!InputRules.IsLanguage(language))
            throw ApiException.Validation(
                "Choose Chinese, Italian or English.",
                "defaultLanguage",
                "The language code must be zh, it or en."
            );
        var updated = await context
            .Restaurants.Where(x => x.Id == restaurantId)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.DefaultLanguage, language), ct);
        if (updated == 0)
            throw MenuErrors.NotFound();
        return new(language);
    }

    private Task WriteAsync(Guid restaurantId, Func<Task> operation, CancellationToken ct) =>
        WriteAsync(
            restaurantId,
            async () =>
            {
                await operation();
                return true;
            },
            ct
        );

    private async Task<T> WriteAsync<T>(
        Guid restaurantId,
        Func<Task<T>> operation,
        CancellationToken ct
    )
    {
        try
        {
            return await MenuWrites.RunAsync(context, restaurantId, operation, ct);
        }
        catch (DbUpdateException error)
            when (error.InnerException
                    is PostgresException
                    {
                        SqlState: PostgresErrorCodes.UniqueViolation,
                        ConstraintName: "uq_menu_items_code"
                    }
            )
        {
            throw new ApiException(
                409,
                "ITEM_CODE_CONFLICT",
                "Another dish already uses this code.",
                new Dictionary<string, string[]>
                {
                    ["itemCode"] = ["Use a different code or leave it empty."],
                }
            );
        }
    }
}
