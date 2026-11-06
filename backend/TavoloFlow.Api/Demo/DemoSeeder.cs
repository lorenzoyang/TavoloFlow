using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Demo;

public sealed class DemoSeeder(
    ApplicationDbContext db,
    IHostEnvironment environment,
    IPasswordHasher<RestaurantUser> storeHasher,
    IPasswordHasher<PlatformUser> platformHasher,
    TimeProvider clock
)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public async Task<bool> SeedAsync(string root, CancellationToken ct = default)
    {
        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException("Demo initialization requires Development.");
        }

        // This local fixture is imported once.
        // Existing business data is never repaired or overwritten.
        if (await db.Restaurants.AnyAsync(ct) || await db.PlatformUsers.AnyAsync(ct))
        {
            return false;
        }

        var restaurantData = await ReadAsync<DemoRestaurant>(root, "restaurant.json", ct);
        var accounts = await ReadAsync<DemoAccounts>(root, "accounts.json", ct);
        var tables = await ReadAsync<DemoTable[]>(root, "tables.json", ct);
        var menu = await ReadAsync<DemoMenu>(root, "menu.json", ct);
        ValidateAccounts(accounts);
        if (!InputRules.IsRestaurantName(restaurantData.Name))
        {
            throw new InvalidOperationException(
                $"Demo restaurant name must be 1–{InputRules.MaxRestaurantNameLength} characters."
            );
        }

        var restaurant = new Restaurant
        {
            Id = Guid.NewGuid(),
            Name = restaurantData.Name.Trim(),
            DefaultLanguage = restaurantData.DefaultLanguage,
            TimeZone = restaurantData.TimeZone,
            CurrencyCode = restaurantData.CurrencyCode,
            Theme = Enum.Parse<RestaurantTheme>(restaurantData.Theme, ignoreCase: true),
            ServiceStatus = RestaurantServiceStatus.Active,
            OrderingEnabled = true,
            JoinCodeRequired = restaurantData.JoinCodeRequired,
            DefaultAnnualFeeCents = restaurantData.AnnualFeeCents,
        };

        // Menus and table lists sort rows by ID,
        // so IDs that grow in file order keep the fixtures' order on
        // screen (random IDs would shuffle categories, dishes and tables).
        // Photo IDs stay random on purpose.
        var idTime = clock.GetUtcNow();
        Guid NextId() => Guid.CreateVersion7(idTime = idTime.AddMilliseconds(1));

        var categories = menu.Categories.ToDictionary(
            x => x.Key,
            x =>
            {
                var names = MenuValidation.Normalize(
                    new CategoryInput(x.Names.Zh, x.Names.It, x.Names.En)
                );
                return new MenuCategory
                {
                    Id = NextId(),
                    RestaurantId = restaurant.Id,
                    NameZh = names.NameZh,
                    NameIt = names.NameIt,
                    NameEn = names.NameEn,
                };
            }
        );

        var images = new List<MenuItemImage>();

        // Decode all images before opening the write transaction,
        // just like ordinary image uploads.
        foreach (var item in menu.Items)
        {
            var category = categories[item.Category];
            if (
                string.IsNullOrWhiteSpace(item.Image)
                || Path.GetFileName(item.Image) != item.Image
                || item.Image.Contains('\\')
                || !item.Image.EndsWith(".webp", StringComparison.Ordinal)
            )
            {
                throw new InvalidOperationException(
                    "Demo image names must be WebP filenames without directories."
                );
            }

            var content = MenuValidation.Normalize(
                new MenuItemInput(
                    category.Id,
                    item.Key,
                    item.Names.Zh,
                    item.Names.It,
                    item.Names.En,
                    item.Descriptions.Zh,
                    item.Descriptions.It,
                    item.Descriptions.En,
                    item.PriceCents,
                    item.AllergenCodes,
                    item.AllergenReviewed
                )
            );

            await using var stream = File.OpenRead(Path.Combine(root, "images", item.Image));
            var bytes = await MenuImages.EncodeAsync(stream, stream.Length, ct);
            var imageId = Guid.NewGuid();
            var entity = new MenuItem
            {
                Id = NextId(),
                RestaurantId = restaurant.Id,
                CategoryId = category.Id,
                ItemCode = content.ItemCode,
                NameZh = content.NameZh,
                NameIt = content.NameIt,
                NameEn = content.NameEn,
                DescriptionZh = content.DescriptionZh,
                DescriptionIt = content.DescriptionIt,
                DescriptionEn = content.DescriptionEn,
                PriceCents = content.PriceCents,
                AllergenCodes = content.AllergenCodes!,
                AllergenReviewed = true,
                IsAvailable = item.IsAvailable,
                ImageId = imageId,
            };

            restaurant.MenuItems.Add(entity);
            images.Add(
                new MenuItemImage
                {
                    Id = imageId,
                    MenuItemId = entity.Id,
                    Content = bytes,
                }
            );
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        foreach (var category in categories.Values)
        {
            restaurant.MenuCategories.Add(category);
        }
        foreach (var table in tables)
        {
            restaurant.Tables.Add(
                new RestaurantTable
                {
                    Id = NextId(),
                    TableLabel = table.TableLabel.Trim(),
                    IsEnabled = table.IsEnabled,
                    QrToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
                }
            );
        }

        restaurant.Users.Add(CreateUser(accounts.Owner, RestaurantUserRole.Owner));
        restaurant.Users.Add(CreateUser(accounts.Staff, RestaurantUserRole.Staff));
        db.Restaurants.Add(restaurant);

        var admin = new PlatformUser
        {
            Id = Guid.NewGuid(),
            Username = AccountInput.NormalizeUsername(accounts.Admin.Username),
            PasswordHash = "",
        };
        admin.PasswordHash = platformHasher.HashPassword(admin, accounts.Admin.Password);
        db.PlatformUsers.Add(admin);

        var today = DateOnly.FromDateTime(
            TimeZoneInfo
                .ConvertTime(
                    clock.GetUtcNow(),
                    TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone)
                )
                .DateTime
        );

        db.RestaurantSubscriptionPeriods.Add(
            new RestaurantSubscriptionPeriod
            {
                Id = Guid.NewGuid(),
                RestaurantId = restaurant.Id,
                StartsOn = today,
                EndsOn = today.AddYears(1),
                Years = 1,
                AmountCents = restaurantData.AnnualFeeCents,
                PaidOn = today,
            }
        );

        db.MenuItemImages.AddRange(images);
        await db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);

        return true;
    }

    private RestaurantUser CreateUser(SeedAccountOptions account, RestaurantUserRole role)
    {
        var user = new RestaurantUser
        {
            Id = Guid.NewGuid(),
            Username = AccountInput.NormalizeUsername(account.Username),
            PasswordHash = "",
            Role = role,
            MustChangePassword = false,
        };
        user.PasswordHash = storeHasher.HashPassword(user, account.Password);

        return user;
    }

    private static async Task<T> ReadAsync<T>(string root, string file, CancellationToken ct)
    {
        await using var stream = File.OpenRead(Path.Combine(root, "data", file));

        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, ct)
            ?? throw new InvalidOperationException($"Empty demo fixture: {file}.");
    }

    private static void ValidateAccounts(DemoAccounts accounts)
    {
        var all = new[] { accounts.Owner, accounts.Staff, accounts.Admin };
        if (
            all.Any(x =>
                x is null
                || !AccountInput.IsValidUsername(x.Username)
                || !AccountInput.IsValidPassword(x.Password)
            )
            || AccountInput.NormalizeUsername(accounts.Owner.Username)
                == AccountInput.NormalizeUsername(accounts.Staff.Username)
        )
        {
            throw new InvalidOperationException("Invalid demo account configuration.");
        }
    }
}
