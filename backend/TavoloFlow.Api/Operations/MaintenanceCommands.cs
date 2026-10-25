using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Operations;

// Program.cs doubles as a one-shot CLI: a maintenance flag runs its command and exits without serving requests.
public static class MaintenanceCommands
{
    private const string SeedDevelopmentAccounts = "--seed-dev-accounts";
    private const string SeedPlatformAdmin = "--seed-platform-admin";
    private const string ResetPlatformPassword = "--reset-platform-password";
    private static readonly string[] Flags = [SeedDevelopmentAccounts, SeedPlatformAdmin, ResetPlatformPassword];

    // Returns the requested command, if any, and the remaining arguments for the web host.
    public static string? Parse(string[] args, out string[] hostArgs)
    {
        var commands = args.Where(arg => Flags.Contains(arg, StringComparer.Ordinal)).ToArray();
        if (commands.Length > 1) throw new InvalidOperationException("Run one initialization or recovery command at a time.");
        hostArgs = args.Where(arg => !Flags.Contains(arg, StringComparer.Ordinal)).ToArray();
        return commands.SingleOrDefault();
    }

    public static async Task RunAsync(WebApplication app, string command)
    {
        // No HTTP request means no per-request scope. The seeder and bootstrap services are scoped
        // (they depend on DbContext), so create a scope by hand; disposing it also releases the DbContext.
        await using var scope = app.Services.CreateAsyncScope();
        if (command == SeedDevelopmentAccounts)
        {
            var seed = app.Configuration.GetSection("DevelopmentSeed").Get<DevelopmentSeedOptions>() ?? new();
            var created = await scope.ServiceProvider.GetRequiredService<DevelopmentAccountSeeder>().SeedAsync(seed);
            app.Logger.LogInformation("Development accounts seeded (created: {Created}).", created);
            return;
        }

        var bootstrap = app.Configuration.GetSection("PlatformBootstrap").Get<PlatformBootstrapOptions>() ?? new();
        var changed = await scope.ServiceProvider.GetRequiredService<PlatformBootstrap>()
            .RunAsync(bootstrap, reset: command == ResetPlatformPassword);
        app.Logger.LogInformation("Platform command completed (changed: {Changed}).", changed);
    }
}
