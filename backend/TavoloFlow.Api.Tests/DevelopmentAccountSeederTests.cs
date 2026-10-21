using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class DevelopmentAccountSeederTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Seed_ValidConfiguration_CreatesAccountsAndLeavesExistingCredentialsUnchanged()
    {
        var options = Options();
        await using var context = database.CreateContext();
        var hasher = new PasswordHasher<RestaurantUser>();
        var seeder = new DevelopmentAccountSeeder(context, hasher, Environment());
        Assert.True(await seeder.SeedAsync(options));
        context.ChangeTracker.Clear();
        var restaurant = await context.Restaurants.Include(item => item.Users).SingleAsync(item => item.Id == options.RestaurantId);
        Assert.Equal(RestaurantServiceStatus.Suspended, restaurant.ServiceStatus);
        Assert.False(restaurant.OrderingEnabled);
        Assert.Equal(2, restaurant.Users.Count);
        Assert.All(restaurant.Users, user =>
        {
            Assert.True(user.IsActive);
            Assert.True(user.MustChangePassword);
            Assert.Equal(1, user.CredentialVersion);
            Assert.Equal(user.Username.ToLowerInvariant(), user.Username);
            Assert.Equal(PasswordVerificationResult.Success,
                hasher.VerifyHashedPassword(user, user.PasswordHash,
                    user.Role == RestaurantUserRole.Owner ? options.Owner.Password : options.Staff.Password));
        });
        var owner = restaurant.Users.Single(user => user.Role == RestaurantUserRole.Owner);
        owner.CredentialVersion = 2;
        owner.MustChangePassword = false;
        owner.PasswordHash = hasher.HashPassword(owner, "User-changed-password");
        await context.SaveChangesAsync();
        var oldHash = owner.PasswordHash;
        options.Owner.Password = "Different-seed-password";
        Assert.False(await seeder.SeedAsync(options));
        context.ChangeTracker.Clear();
        owner = (await context.RestaurantUsers.FindAsync(owner.Id))!;
        Assert.Equal(oldHash, owner.PasswordHash);
        Assert.Equal(2, owner.CredentialVersion);
        Assert.False(owner.MustChangePassword);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Seed_NotDevelopment_RejectsWithoutWriting(string environment)
    {
        await using var context = database.CreateContext();
        var options = Options();
        var seeder = new DevelopmentAccountSeeder(context, new PasswordHasher<RestaurantUser>(), Environment(environment));
        await Assert.ThrowsAsync<InvalidOperationException>(() => seeder.SeedAsync(options));
        Assert.False(await context.Restaurants.AnyAsync(item => item.Id == options.RestaurantId));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Seed_IncompleteOrConflictingData_DoesNotOverwriteOrPartiallyCreate(bool incomplete)
    {
        await using var context = database.CreateContext();
        var options = Options();
        var existing = new Restaurant { Id = incomplete ? options.RestaurantId : Guid.NewGuid(), Name = options.RestaurantName, DefaultLanguage = "zh" };
        existing.Users.Add(new RestaurantUser
        {
            Username = options.Owner.Username.Trim().ToLowerInvariant(),
            PasswordHash = "existing-hash", Role = RestaurantUserRole.Owner
        });
        context.Restaurants.Add(existing);
        await context.SaveChangesAsync();
        var seeder = new DevelopmentAccountSeeder(context, new PasswordHasher<RestaurantUser>(), Environment());
        await Assert.ThrowsAsync<InvalidOperationException>(() => seeder.SeedAsync(options));
        Assert.False(await context.RestaurantUsers.AnyAsync(user => user.Username == options.Staff.Username));
        Assert.Equal(incomplete, await context.Restaurants.AnyAsync(item => item.Id == options.RestaurantId));
        Assert.Equal("existing-hash", (await context.RestaurantUsers.SingleAsync(user => user.RestaurantId == existing.Id)).PasswordHash);
    }

    [Fact]
    public async Task Seed_DatabaseFailure_RollsBackRestaurantAndAccounts()
    {
        // An isolated database allows a trigger to simulate failure while saving the two accounts.
        await using var context = await database.CreateIsolatedContextAsync();
        await context.Database.MigrateAsync();
        await context.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_seed_staff() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.role = 'STAFF' THEN RAISE EXCEPTION 'Injected seed failure'; END IF;
                RETURN NEW;
            END;
            $$;
            CREATE TRIGGER reject_staff BEFORE INSERT ON restaurant_users
                FOR EACH ROW EXECUTE FUNCTION reject_seed_staff();
            """);
        var seeder = new DevelopmentAccountSeeder(context, new PasswordHasher<RestaurantUser>(), Environment());
        await Assert.ThrowsAsync<DbUpdateException>(() => seeder.SeedAsync(Options()));
        Assert.False(await context.Restaurants.AnyAsync());
        Assert.False(await context.RestaurantUsers.AnyAsync());
    }

    private static DevelopmentSeedOptions Options() => new()
    {
        RestaurantId = Guid.NewGuid(),
        RestaurantName = "开发餐厅",
        Owner = new SeedAccountOptions { Username = $" OWNER_{Guid.NewGuid():N} ", Password = "Owner-password-123" },
        Staff = new SeedAccountOptions { Username = $"staff_{Guid.NewGuid():N}", Password = "Staff-password-123" }
    };

    private static IHostEnvironment Environment(string name = "Development") => new TestEnvironment { EnvironmentName = name };

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "";
        public string ApplicationName { get; set; } = "TavoloFlow.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
