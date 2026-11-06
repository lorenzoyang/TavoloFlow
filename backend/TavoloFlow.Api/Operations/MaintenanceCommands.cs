using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Demo;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Operations;

// Program.cs doubles as a one-shot CLI: a maintenance flag runs its command and exits without serving requests.
public static class MaintenanceCommands
{
    // Creates the OWNER/STAFF accounts for local development.
    private const string SeedDevelopmentAccounts = "--seed-dev-accounts";

    // Creates the first platform administrator.
    private const string SeedPlatformAdmin = "--seed-platform-admin";

    // Resets the platform administrator's password.
    private const string ResetPlatformPassword = "--reset-platform-password";

    // Fills an empty database with the demo restaurant.
    private const string SeedDemo = "--seed-demo";

    private static readonly string[] Flags =
    [
        SeedDevelopmentAccounts,
        SeedPlatformAdmin,
        ResetPlatformPassword,
        SeedDemo,
    ];

    // Returns the requested command, if any, and the remaining arguments for the web host.
    public static string? Parse(string[] args, out string[] hostArgs)
    {
        var commands = args.Where(arg => Flags.Contains(arg, StringComparer.Ordinal)).ToArray();

        if (commands.Length > 1)
        {
            throw new InvalidOperationException(
                "Run one initialization or recovery command at a time."
            );
        }

        hostArgs = [.. args.Where(arg => !Flags.Contains(arg, StringComparer.Ordinal))];
        return commands.SingleOrDefault();
    }

    public static async Task RunAsync(WebApplication app, string command)
    {
        // No HTTP request means no per-request scope.
        // The seeder and bootstrap services are scoped (they depend on DbContext),
        // so create a scope by hand; disposing it also releases the DbContext.
        await using var scope = app.Services.CreateAsyncScope();

        if (command == SeedDemo)
        {
            var root =
                app.Configuration["Demo:DataPath"]
                ?? Path.Combine(app.Environment.ContentRootPath, "demo");
            var created = await scope
                .ServiceProvider.GetRequiredService<DemoSeeder>()
                .SeedAsync(root);

            if (created)
            {
                app.Logger.LogInformation("Demo data initialized.");
            }
            else
            {
                app.Logger.LogInformation(
                    "Demo database already contains business data; initialization skipped."
                );
            }

            return;
        }
        if (command == SeedDevelopmentAccounts)
        {
            var seed =
                app.Configuration.GetSection("DevelopmentSeed").Get<DevelopmentSeedOptions>()
                ?? new();
            var created = await scope
                .ServiceProvider.GetRequiredService<DevelopmentAccountSeeder>()
                .SeedAsync(seed);

            app.Logger.LogInformation("Development accounts seeded (created: {Created}).", created);

            return;
        }

        var bootstrap =
            app.Configuration.GetSection("PlatformBootstrap").Get<PlatformBootstrapOptions>()
            ?? new();
        var changed = await scope
            .ServiceProvider.GetRequiredService<PlatformBootstrap>()
            .RunAsync(bootstrap, reset: command == ResetPlatformPassword);

        app.Logger.LogInformation("Platform command completed (changed: {Changed}).", changed);
    }
}
