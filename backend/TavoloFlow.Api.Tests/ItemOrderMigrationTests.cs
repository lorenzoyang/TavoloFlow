using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

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
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        // These inserts must depend only on the schema at the migration's starting version.
        foreach (var restaurantId in new[] { first, second })
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO restaurants (id, name, default_language) VALUES ({restaurantId}, 'Migration', 'en')"
            );
        var categories = new[]
        {
            new
            {
                Id = Guid.NewGuid(),
                RestaurantId = first,
                Name = "A",
                Position = 0,
            },
            new
            {
                Id = Guid.NewGuid(),
                RestaurantId = first,
                Name = "B",
                Position = 1,
            },
            new
            {
                Id = Guid.NewGuid(),
                RestaurantId = second,
                Name = "C",
                Position = 0,
            },
            new
            {
                Id = Guid.NewGuid(),
                RestaurantId = second,
                Name = "Empty",
                Position = 1,
            },
        };
        foreach (var category in categories)
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO menu_categories (id, restaurant_id, name_en, position)
                VALUES ({category.Id}, {category.RestaurantId}, {category.Name}, {category.Position})
                """
            );
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
        {
            var category = categories[i];
            foreach (var id in groups[i].Reverse())
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO menu_items (id, restaurant_id, category_id, name_en, price_cents,
                        allergen_codes, allergen_reviewed, is_available)
                    VALUES ({id}, {category.RestaurantId}, {category.Id}, 'Dish', 1000, ARRAY[]::text[], true, true)
                    """
                );
        }
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
