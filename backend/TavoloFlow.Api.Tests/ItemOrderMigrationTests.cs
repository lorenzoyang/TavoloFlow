using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class ItemOrderMigrationTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Migrate_LegacyItems_PreservesOrderWithinEachRestaurantAndCategory()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261115132915_AddMenuCategoryPosition");
        var first = new Restaurant { Name = "First", DefaultLanguage = "en" };
        var second = new Restaurant { Name = "Second", DefaultLanguage = "en" };
        var categories = new[]
        {
            new MenuCategory { Restaurant = first, NameEn = "A" },
            new MenuCategory
            {
                Restaurant = first,
                NameEn = "B",
                Position = 1,
            },
            new MenuCategory { Restaurant = second, NameEn = "C" },
            new MenuCategory
            {
                Restaurant = second,
                NameEn = "Empty",
                Position = 1,
            },
        };
        db.MenuCategories.AddRange(categories);
        await db.SaveChangesAsync();
        var ids = Enumerable
            .Range(1, 6)
            .Select(n => Guid.Parse($"00000000-0000-4000-8000-{n:D12}"))
            .ToArray();
        var groups = new[]
        {
            new[] { ids[0], ids[4] },
            new[] { ids[2], ids[5] },
            new[] { ids[1], ids[3] },
        };
        for (var i = 0; i < groups.Length; i++)
            foreach (var id in groups[i].Reverse())
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO menu_items (id, restaurant_id, category_id, name_en, price_cents,
                        allergen_codes, allergen_reviewed, is_available)
                    VALUES ({id}, {categories[i].RestaurantId}, {categories[
                        i
                    ].Id}, 'Dish', 1000, ARRAY[]::text[], true, true)
                    """
                );
        await migrator.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        for (var i = 0; i < groups.Length; i++)
        {
            var items = await db
                .MenuItems.AsNoTracking()
                .Where(x => x.CategoryId == categories[i].Id)
                .OrderBy(x => x.Position)
                .ThenBy(x => x.Id)
                .ToArrayAsync();
            Assert.Equal(groups[i], items.Select(x => x.Id));
            Assert.Equal(new[] { 0, 1 }, items.Select(x => x.Position));
        }
        Assert.False(await db.MenuItems.AnyAsync(x => x.CategoryId == categories[3].Id));
        var error = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE menu_items SET position = -1 WHERE id = {ids[0]}"
            )
        );
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        Assert.Equal("ck_item_position", error.ConstraintName);
    }
}
