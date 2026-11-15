using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class CategoryOrderMigrationTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Migrate_ExistingCategories_PreservesEachRestaurantsOrderAndEnforcesPosition()
    {
        await using var context = await database.CreateIsolatedContextAsync();
        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync("20261114171915_AddPushSubscriptions");
        var restaurants = Enumerable
            .Range(0, 3)
            .Select(index => new Restaurant { Name = $"Migration {index}", DefaultLanguage = "it" })
            .ToArray();
        context.Restaurants.AddRange(restaurants);
        await context.SaveChangesAsync();
        Guid[] ids =
        [
            Guid.Parse("00000000-0000-4000-8000-000000000001"),
            Guid.Parse("00000000-0000-4000-8000-000000000002"),
            Guid.Parse("00000000-0000-4000-8000-000000000003"),
            Guid.Parse("00000000-0000-4000-8000-000000000004"),
        ];
        foreach (
            var (id, restaurantId) in new[]
            {
                (ids[3], restaurants[1].Id),
                (ids[2], restaurants[0].Id),
                (ids[0], restaurants[0].Id),
                (ids[1], restaurants[1].Id),
            }
        )
            await context.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO menu_categories (id, restaurant_id, name_it) VALUES ({id}, {restaurantId}, 'Piatti')"
            );

        await migrator.MigrateAsync();
        Assert.False(context.Database.HasPendingModelChanges());
        for (var i = 0; i < 2; i++)
        {
            var categories = await context
                .MenuCategories.AsNoTracking()
                .Where(x => x.RestaurantId == restaurants[i].Id)
                .OrderBy(x => x.Position)
                .ThenBy(x => x.Id)
                .ToArrayAsync();
            Assert.Equal(new[] { ids[i], ids[i + 2] }, categories.Select(x => x.Id));
            Assert.Equal(new[] { 0, 1 }, categories.Select(x => x.Position));
        }
        Assert.False(
            await context.MenuCategories.AnyAsync(x => x.RestaurantId == restaurants[2].Id)
        );
        var error = await Assert.ThrowsAsync<PostgresException>(() =>
            context.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE menu_categories SET position = -1 WHERE id = {ids[0]}"
            )
        );
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        Assert.Equal("ck_category_position", error.ConstraintName);
        Assert.Equal(
            0,
            await context
                .MenuCategories.Where(x => x.Id == ids[0])
                .Select(x => x.Position)
                .SingleAsync()
        );
    }
}
