using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace TavoloFlow.Api.Operations;

public static class DeploymentConfiguration
{
    public static IServiceCollection AddDeployment(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            // Keep loopback defaults; add only explicitly configured proxy addresses.
            foreach (var value in configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [])
            {
                if (!IPAddress.TryParse(value, out var address)) throw new InvalidOperationException("Invalid trusted proxy address.");
                options.KnownProxies.Add(address);
            }
        });
        return services;
    }

    public static void ValidateKeyRing(IConfiguration configuration, IHostEnvironment environment)
    {
        if (environment.IsDevelopment()) return;
        var path = configuration["DataProtection:KeyRingPath"];
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
            throw new InvalidOperationException("Production requires an absolute, persistent DataProtection:KeyRingPath.");
        Directory.CreateDirectory(path);
        // Only used to confirm that writing to this directory is possible.
        var probe = Path.Combine(path, $".write-check-{Guid.NewGuid():N}");
        try { using var stream = new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        { throw new InvalidOperationException("The Data Protection key directory must be writable by the application."); }
    }
}
