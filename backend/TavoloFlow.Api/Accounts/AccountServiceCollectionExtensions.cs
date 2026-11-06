using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public static class AccountServiceCollectionExtensions
{
    // The Store identity: OWNER/STAFF cookie, its authorization policies and account services.
    public static IServiceCollection AddStoreAccounts(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        services.AddSingleton<IPasswordHasher<RestaurantUser>, PasswordHasher<RestaurantUser>>();
        // Unknown usernames still run a hash check, so response time does not reveal which accounts exist.
        services.AddSingleton<UnknownAccountPassword>();

        services.AddScoped<AccountService>();
        services.AddScoped<DevelopmentAccountSeeder>();
        services.AddScoped<CurrentAccount>();
        services.AddScoped<StoreCookieEvents>();

        services.AddSingleton<IAuthorizationHandler, PasswordChangedHandler>();
        services.AddSingleton<
            IAuthorizationMiddlewareResultHandler,
            AccountAuthorizationResultHandler
        >();

        services
            .AddOptions<AccountRateLimitOptions>()
            .Bind(configuration.GetSection("AccountRateLimits"))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddSingleton(provider => new AccountRateLimiter(
            provider.GetRequiredService<IOptions<AccountRateLimitOptions>>().Value
        ));

        services
            .AddAuthentication()
            .AddCookie(
                StoreAuthentication.Scheme,
                options =>
                {
                    options.Cookie.Name = StoreAuthentication.CookieName;
                    options.Cookie.HttpOnly = true;
                    options.Cookie.SameSite = SameSiteMode.Lax;
                    options.Cookie.SecurePolicy = BrowserSecurity.CookiePolicy(environment);
                    options.Cookie.Path = "/";
                    options.ExpireTimeSpan = StoreAuthentication.Lifetime;
                    options.SlidingExpiration = false;
                    // It requires services such as databases, and these services are scoped,
                    // so this StoreCookieEvents also needs to be scoped. Therefore,
                    // after registering it earlier, it is declared here.
                    options.EventsType = typeof(StoreCookieEvents);
                }
            );
        var staff = new AuthorizationPolicyBuilder(StoreAuthentication.Scheme)
            .RequireAuthenticatedUser()
            .RequireRole("OWNER", "STAFF")
            .AddRequirements(new PasswordChangedRequirement())
            .Build();

        services
            .AddAuthorizationBuilder()
            // Endpoints without an explicit policy are store-staff only, so nothing is public by accident.
            .SetDefaultPolicy(staff)
            .SetFallbackPolicy(staff)
            .AddPolicy(StoreAuthentication.StaffPolicy, staff)
            .AddPolicy(
                StoreAuthentication.AccountPolicy,
                policy =>
                    policy
                        .AddAuthenticationSchemes(StoreAuthentication.Scheme)
                        .RequireAuthenticatedUser()
                        .RequireRole("OWNER", "STAFF")
            )
            .AddPolicy(
                StoreAuthentication.OwnerPolicy,
                policy =>
                    policy
                        .AddAuthenticationSchemes(StoreAuthentication.Scheme)
                        .RequireAuthenticatedUser()
                        .RequireRole("OWNER")
                        .AddRequirements(new PasswordChangedRequirement())
            );
        return services;
    }
}
