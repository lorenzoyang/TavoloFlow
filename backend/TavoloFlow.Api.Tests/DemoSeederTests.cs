using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Demo;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class DemoSeederTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Seed_RealFixtures_ImportsUsableDataAndPreservesLaterEdits()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        await db.Database.MigrateAsync();
        Assert.True(await Seeder(db).SeedAsync(FindFixtures()));
        db.ChangeTracker.Clear();

        var restaurant = await db.Restaurants.SingleAsync();
        Assert.Equal("Demo Ramen", restaurant.Name);
        Assert.Equal("en", restaurant.DefaultLanguage);
        Assert.Equal("EUR", restaurant.CurrencyCode);
        Assert.Equal("Europe/Rome", restaurant.TimeZone);
        Assert.Equal(RestaurantTheme.Lacquer, restaurant.Theme);
        Assert.Equal(RestaurantServiceStatus.Active, restaurant.ServiceStatus);
        Assert.True(restaurant.OrderingEnabled);
        Assert.True(restaurant.JoinCodeRequired);
        var users = await db.RestaurantUsers.OrderBy(x => x.Username).ToArrayAsync();
        Assert.Equal(
            new[] { "demo.ramen.owner", "demo.ramen.staff" },
            users.Select(x => x.Username)
        );
        Assert.Equal(RestaurantUserRole.Owner, users[0].Role);
        Assert.Equal(RestaurantUserRole.Staff, users[1].Role);
        Assert.All(
            users,
            user =>
            {
                Assert.True(user.IsActive);
                Assert.False(user.MustChangePassword);
                Assert.Equal(
                    PasswordVerificationResult.Success,
                    new PasswordHasher<RestaurantUser>().VerifyHashedPassword(
                        user,
                        user.PasswordHash,
                        "123456"
                    )
                );
            }
        );
        var admin = await db.PlatformUsers.SingleAsync();
        Assert.True(admin.IsActive);
        Assert.Equal("demo.admin", admin.Username);
        Assert.Equal(
            PasswordVerificationResult.Success,
            new PasswordHasher<PlatformUser>().VerifyHashedPassword(
                admin,
                admin.PasswordHash,
                "123456"
            )
        );
        var tables = await db.RestaurantTables.OrderBy(x => x.TableLabel).ToArrayAsync();
        Assert.Equal(
            Enumerable.Range(1, 8).Select(x => $"T{x:00}"),
            tables.Select(x => x.TableLabel)
        );
        Assert.All(tables, table => Assert.True(table.IsEnabled));
        var categories = await db.MenuCategories.ToArrayAsync();
        Assert.Equal(4, categories.Length);
        Assert.All(
            categories,
            category =>
                Assert.All(
                    new[] { category.NameZh, category.NameIt, category.NameEn },
                    value => Assert.False(string.IsNullOrWhiteSpace(value))
                )
        );
        var items = await db.MenuItems.ToArrayAsync();
        Assert.Equal(12, items.Length);
        Assert.All(
            items,
            item =>
            {
                Assert.True(item.IsAvailable);
                Assert.True(item.AllergenReviewed);
                Assert.All(
                    new[]
                    {
                        item.NameZh,
                        item.NameIt,
                        item.NameEn,
                        item.DescriptionZh,
                        item.DescriptionIt,
                        item.DescriptionEn,
                    },
                    value => Assert.False(string.IsNullOrWhiteSpace(value))
                );
            }
        );
        // Screens list rows by ID: categories, dishes and tables must keep the fixtures' order.
        Assert.Equal(
            new[] { "Ramen", "Sides", "Drinks", "Desserts" },
            (await db.MenuCategories.OrderBy(x => x.Id).ToArrayAsync()).Select(x => x.NameEn)
        );
        Assert.Equal(
            new[] { "tonkotsu-ramen", "shoyu-ramen", "miso-ramen", "vegan-ramen" },
            (
                await db
                    .MenuItems.OrderBy(x => x.CategoryId)
                    .ThenBy(x => x.Id)
                    .Take(4)
                    .ToArrayAsync()
            ).Select(x => x.ItemCode)
        );
        Assert.Equal(
            Enumerable.Range(1, 8).Select(x => $"T{x:00}"),
            (await db.RestaurantTables.OrderBy(x => x.Id).ToArrayAsync()).Select(x => x.TableLabel)
        );
        var images = await db.MenuItemImages.ToArrayAsync();
        Assert.Equal(12, images.Length);
        Assert.All(
            images,
            image =>
            {
                Assert.NotEmpty(image.Content);
                Assert.Equal(image.Id, items.Single(x => x.Id == image.MenuItemId).ImageId);
            }
        );
        // Every ramen takes a required spice level; the vegan one skips the egg and chashu extras.
        var groups = await db
            .MenuOptionGroups.Include(x => x.Options)
            .OrderBy(x => x.Position)
            .ToArrayAsync();
        Assert.Equal(new[] { "Spice level", "Extras" }, groups.Select(x => x.NameEn));
        Assert.Equal((1, 1), (groups[0].MinSelect, groups[0].MaxSelect));
        Assert.Equal((0, 3), (groups[1].MinSelect, groups[1].MaxSelect));
        Assert.Equal(
            new[] { "Marinated egg", "Extra chashu", "Extra noodles", "Nori", "Sweet corn" },
            groups[1].Options.OrderBy(x => x.Position).Select(x => x.NameEn)
        );
        Assert.Equal(
            new[] { "EGGS" },
            groups[1].Options.Single(x => x.Position == 0).AllergenCodes
        );
        var links = await db.MenuItemOptionGroups.ToArrayAsync();
        var ramen = items.Where(x => x.ItemCode!.EndsWith("-ramen")).Select(x => x.Id).ToHashSet();
        Assert.True(
            ramen.SetEquals(links.Where(x => x.GroupId == groups[0].Id).Select(x => x.MenuItemId))
        );
        var vegan = items.Single(x => x.ItemCode == "vegan-ramen").Id;
        Assert.True(
            ramen
                .Where(x => x != vegan)
                .ToHashSet()
                .SetEquals(links.Where(x => x.GroupId == groups[1].Id).Select(x => x.MenuItemId))
        );
        var period = await db.RestaurantSubscriptionPeriods.SingleAsync();
        var today = DateOnly.FromDateTime(
            TimeZoneInfo
                .ConvertTime(
                    DateTimeOffset.UtcNow,
                    TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone)
                )
                .DateTime
        );
        Assert.Equal(today, period.StartsOn);
        Assert.Equal(today.AddYears(1), period.EndsOn);
        Assert.Equal(today, period.PaidOn);
        Assert.Equal(19900, period.AmountCents);
        Assert.False(await db.DiningSessions.AnyAsync());
        Assert.False(await db.Orders.AnyAsync());
        Assert.False(await db.OrderItems.AnyAsync());

        var owner = users[0];
        owner.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(
            owner,
            "Changed-demo-password"
        );
        var changedHash = owner.PasswordHash;
        db.MenuItems.Remove(items[0]);
        await db.SaveChangesAsync();
        Assert.False(await Seeder(db).SeedAsync("/fixtures-are-not-read-after-import"));
        db.ChangeTracker.Clear();
        Assert.Equal(
            changedHash,
            (await db.RestaurantUsers.SingleAsync(x => x.Id == owner.Id)).PasswordHash
        );
        Assert.Equal(11, await db.MenuItems.CountAsync());
        Assert.Equal(11, await db.MenuItemImages.CountAsync());
        Assert.Equal(2, await db.RestaurantUsers.CountAsync());
        Assert.Equal(1, await db.PlatformUsers.CountAsync());
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Seed_NotDevelopment_RejectsBeforeReadingFilesOrAccessingDatabase(
        string environment
    )
    {
        // No database provider: touching the database before the environment check would fail differently.
        await using var db = new ApplicationDbContext(new DbContextOptions<ApplicationDbContext>());
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Seeder(db, environment).SeedAsync("/missing-fixtures")
        );
        Assert.Equal("Demo initialization requires Development.", error.Message);
    }

    private static DemoSeeder Seeder(ApplicationDbContext db, string environment = "Development") =>
        new(
            db,
            new TestEnvironment { EnvironmentName = environment },
            new PasswordHasher<RestaurantUser>(),
            new PasswordHasher<PlatformUser>(),
            TimeProvider.System
        );

    private static string FindFixtures()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var root = Path.Combine(directory.FullName, "demo");
            if (File.Exists(Path.Combine(root, "data", "menu.json")))
                return root;
            directory = directory.Parent;
        }
        throw new InvalidOperationException("Demo fixture directory not found.");
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "TavoloFlow.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
