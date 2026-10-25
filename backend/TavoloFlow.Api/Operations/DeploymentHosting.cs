using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Operations;

public static class DeploymentHosting
{
    public static IServiceCollection AddDeploymentHosting(this IServiceCollection services,
        IConfiguration configuration)
    {
        var proxies = configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
        var addresses = proxies.Select(IPAddress.Parse).ToArray();
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            // With no configured proxy, leave processing disabled. Clearing both trust lists while
            // processing is enabled would trust everyone, which must never be our fallback.
            if (addresses.Length == 0) return;
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var address in addresses) options.KnownProxies.Add(address);
        });
        services.AddHealthChecks().AddCheck<DatabaseReadiness>("database");
        return services;
    }
}

// Only connectivity is reported. Migration remains a separate, explicit deployment operation.
public sealed class DatabaseReadiness(ApplicationDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy();
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            // Do not include exception details, server addresses or credentials in health responses.
            return HealthCheckResult.Unhealthy();
        }
    }
}
