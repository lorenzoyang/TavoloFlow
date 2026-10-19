using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Data;
using Testcontainers.PostgreSql;

namespace TavoloFlow.Api.Tests;

public sealed class PostgreSqlFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18-alpine").Build();

    public bool InitiallyEmpty { get; private set; }

    public ApplicationDbContext CreateContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(container.GetConnectionString())
            .Options);

    public async Task<ApplicationDbContext> CreateIsolatedContextAsync()
    {
        // A separate database in the same disposable container lets upgrade tests seed an older schema.
        var databaseName = $"upgrade_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(container.GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", connection);
        await command.ExecuteNonQueryAsync();
        var connectionString = new NpgsqlConnectionStringBuilder(container.GetConnectionString())
        {
            Database = databaseName
        };
        return new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString.ConnectionString).Options);
    }

    public async Task InitializeAsync()
    {
        await container.StartAsync();
        await using var context = CreateContext();
        await context.Database.MigrateAsync();
        // All other entity types require a restaurant, so these roots establish there is no seed data.
        InitiallyEmpty = !await context.Restaurants.AnyAsync() && !await context.PlatformUsers.AnyAsync();
    }

    public async Task DisposeAsync() => await container.DisposeAsync();
}
