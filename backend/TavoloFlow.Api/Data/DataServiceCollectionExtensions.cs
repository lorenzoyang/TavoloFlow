using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace TavoloFlow.Api.Data;

public static class DataServiceCollectionExtensions
{
    public static IServiceCollection AddDataLayer(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(connectionString) && !string.IsNullOrWhiteSpace(configuration["Database:Host"]))
        {
            // Structured configuration supports arbitrary passwords from mounted secret files.
            if (string.IsNullOrWhiteSpace(configuration["Database:Password"]))
                throw new InvalidOperationException("Configure the database password through a protected configuration source.");
            connectionString = new NpgsqlConnectionStringBuilder
            {
                Host = configuration["Database:Host"], Database = configuration["Database:Name"],
                Username = configuration["Database:Username"], Password = configuration["Database:Password"],
                // The bundled deployment uses password authentication on its private network.
                GssEncryptionMode = GssEncryptionMode.Disable,
                IncludeErrorDetail = false
            }.ConnectionString;
        }
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Configure ConnectionStrings:Default using user secrets or " +
                "the ConnectionStrings__Default environment variable.");
        }

        services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<CatalogDeletionService>();
        return services;
    }
}
