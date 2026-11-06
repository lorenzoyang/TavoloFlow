using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public sealed class DevelopmentSeedOptions
{
    public Guid RestaurantId { get; set; }
    public string RestaurantName { get; set; } = "";
    public SeedAccountOptions Owner { get; set; } = new();
    public SeedAccountOptions Staff { get; set; } = new();
}

public sealed class SeedAccountOptions
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

public sealed class DevelopmentAccountSeeder(
    ApplicationDbContext context,
    IPasswordHasher<RestaurantUser> passwordHasher,
    IHostEnvironment environment
)
{
    public async Task<bool> SeedAsync(
        DevelopmentSeedOptions options,
        CancellationToken cancellationToken = default
    )
    {
        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException(
                "Development account initialization requires Development."
            );
        }

        var ownerName = AccountInput.NormalizeUsername(options.Owner.Username);
        var staffName = AccountInput.NormalizeUsername(options.Staff.Username);
        if (
            options.RestaurantId == Guid.Empty
            || !InputRules.IsRestaurantName(options.RestaurantName)
            || !AccountInput.IsValidUsername(ownerName)
            || !AccountInput.IsValidUsername(staffName)
            || ownerName == staffName
            || !AccountInput.IsValidPassword(options.Owner.Password)
            || !AccountInput.IsValidPassword(options.Staff.Password)
        )
        {
            throw new InvalidOperationException(
                "Provide DevelopmentSeed restaurant ID, restaurant name "
                    + $"(1–{InputRules.MaxRestaurantNameLength} characters), "
                    + $"distinct usernames (1–{AccountInput.MaxUsernameLength} characters) and passwords "
                    + $"({AccountInput.MinPasswordLength}–{AccountInput.MaxPasswordLength} characters) "
                    + "through local configuration."
            );
        }

        await using var transaction = await context.Database.BeginTransactionAsync(
            cancellationToken
        );

        // Serialize concurrent initializations; the unique constraints remain the final safeguard.
        await context.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(726186210001)",
            cancellationToken
        );

        var restaurant = await context
            .Restaurants.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == options.RestaurantId, cancellationToken);
        var accounts = await context
            .RestaurantUsers.AsNoTracking()
            .Where(user =>
                user.RestaurantId == options.RestaurantId
                || user.Username == ownerName
                || user.Username == staffName
            )
            .ToListAsync(cancellationToken);

        if (restaurant is not null || accounts.Count != 0)
        {
            var matches =
                restaurant?.Name == options.RestaurantName.Trim()
                && accounts.Count == 2
                && accounts.Any(user =>
                    user.RestaurantId == options.RestaurantId
                    && user.Username == ownerName
                    && user.Role == RestaurantUserRole.Owner
                )
                && accounts.Any(user =>
                    user.RestaurantId == options.RestaurantId
                    && user.Username == staffName
                    && user.Role == RestaurantUserRole.Staff
                );
            if (!matches)
            {
                throw new InvalidOperationException(
                    "Development seed conflicts with existing or incomplete data. No accounts were changed."
                );
            }

            await transaction.CommitAsync(cancellationToken);
            return false;
        }

        restaurant = new Restaurant
        {
            Id = options.RestaurantId,
            Name = options.RestaurantName.Trim(),
            DefaultLanguage = "zh",
        };
        restaurant.Users.Add(
            CreateUser(ownerName, options.Owner.Password, RestaurantUserRole.Owner)
        );
        restaurant.Users.Add(
            CreateUser(staffName, options.Staff.Password, RestaurantUserRole.Staff)
        );
        context.Restaurants.Add(restaurant);
        await context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private RestaurantUser CreateUser(string username, string password, RestaurantUserRole role)
    {
        var user = new RestaurantUser
        {
            Username = username,
            PasswordHash = "",
            Role = role,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, password);
        return user;
    }
}
