namespace TavoloFlow.Api.Pickup;

public static class PickupServiceCollectionExtensions
{
    // Online pickup: staff settings, the anonymous online menu with its per-IP submission limit.
    public static IServiceCollection AddPickupOrdering(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<PickupSettingsService>();
        services.AddScoped<PickupOrderService>();
        services.AddOptions<PickupRateLimitOptions>().Bind(configuration.GetSection("PickupRateLimits"))
            .ValidateDataAnnotations().ValidateOnStart();
        services.AddSingleton<PickupRateLimiter>();
        return services;
    }
}
