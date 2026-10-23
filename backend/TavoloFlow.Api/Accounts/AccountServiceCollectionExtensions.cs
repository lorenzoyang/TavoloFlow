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
    public static IServiceCollection AddStoreAccounts(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddSingleton<IPasswordHasher<RestaurantUser>, PasswordHasher<RestaurantUser>>();
        // Unknown usernames still run a hash check, so response time does not reveal which accounts exist.
        services.AddSingleton<UnknownAccountPassword>();

        services.AddScoped<AccountService>();
        services.AddScoped<DevelopmentAccountSeeder>();
        services.AddScoped<CurrentAccount>();
        services.AddScoped<StoreCookieEvents>();

        services.AddSingleton<IAuthorizationHandler, PasswordChangedHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, AccountAuthorizationResultHandler>();

        services.AddOptions<AccountRateLimitOptions>()
            .Bind(configuration.GetSection("AccountRateLimits"))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddSingleton(provider =>
            new AccountRateLimiter(provider.GetRequiredService<IOptions<AccountRateLimitOptions>>().Value));

        services.AddAuthentication().AddCookie(StoreAuthentication.Scheme, options =>
        {
            options.Cookie.Name = StoreAuthentication.CookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = BrowserSecurity.CookiePolicy(environment);
            options.Cookie.Path = "/";
            options.ExpireTimeSpan = StoreAuthentication.Lifetime;
            options.SlidingExpiration = false;
            options.EventsType = typeof(StoreCookieEvents);
        });
        services.AddAuthorization(options =>
        {
            var staff = new AuthorizationPolicyBuilder(StoreAuthentication.Scheme)
                .RequireAuthenticatedUser()
                .RequireRole("OWNER", "STAFF")
                .AddRequirements(new PasswordChangedRequirement())
                .Build();

            // Endpoints without an explicit policy are store-staff only, so nothing is public by accident.
            options.DefaultPolicy = staff;
            options.FallbackPolicy = staff;
            options.AddPolicy(StoreAuthentication.StaffPolicy, staff);

            options.AddPolicy(StoreAuthentication.AccountPolicy, policy =>
                policy.AddAuthenticationSchemes(StoreAuthentication.Scheme)
                    .RequireAuthenticatedUser()
                    .RequireRole("OWNER", "STAFF"));

            options.AddPolicy(StoreAuthentication.OwnerPolicy, policy =>
                policy.AddAuthenticationSchemes(StoreAuthentication.Scheme)
                    .RequireAuthenticatedUser()
                    .RequireRole("OWNER")
                    .AddRequirements(new PasswordChangedRequirement()));
        });
        return services;
    }
}
