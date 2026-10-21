using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public static class AccountServiceCollectionExtensions
{
    public static IServiceCollection AddStoreAccounts(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        // provide system time to facilitate unified usage and testing of time-related behaviors.
        services.AddSingleton(TimeProvider.System);
        // generate and verify store account password hashes
        services.AddSingleton<IPasswordHasher<RestaurantUser>, PasswordHasher<RestaurantUser>>();
        // provide auxiliary password verification for unknown account logins to reduce the time difference caused by the existence of the account.
        services.AddSingleton<UnknownAccountPassword>();

        services.AddScoped<AccountService>();
        services.AddScoped<DevelopmentAccountSeeder>();
        services.AddScoped<CurrentAccount>();
        services.AddScoped<StoreCookieEvents>();
        services.AddScoped<CsrfValidationFilter>();

        services.AddSingleton<IAuthorizationHandler, PasswordChangedHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, AccountAuthorizationResultHandler>();

        services.AddOptions<AccountRateLimitOptions>()
            .Bind(configuration.GetSection("AccountRateLimits"))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddSingleton<AccountRateLimiter>();

        var protection = services.AddDataProtection().SetApplicationName("TavoloFlow");
        var keyRingPath = configuration["DataProtection:KeyRingPath"];
        if (!string.IsNullOrWhiteSpace(keyRingPath))
        {
            protection.PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));
        }

        var securePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        services.AddAuthentication(StoreAuthentication.Scheme).AddCookie(StoreAuthentication.Scheme, options =>
        {
            options.Cookie.Name = StoreAuthentication.CookieName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = securePolicy;
            options.Cookie.Path = "/";
            options.ExpireTimeSpan = StoreAuthentication.Lifetime;
            options.SlidingExpiration = false;
            options.EventsType = typeof(StoreCookieEvents);
        });
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "TavoloFlow.Csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = securePolicy;
        });
        services.AddAuthorization(options =>
        {
            var staff = new AuthorizationPolicyBuilder(StoreAuthentication.Scheme)
                .RequireAuthenticatedUser()
                .RequireRole("OWNER", "STAFF")
                .AddRequirements(new PasswordChangedRequirement())
                .Build();

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
        services.Configure<ApiBehaviorOptions>(options =>
        {
            options.InvalidModelStateResponseFactory = action =>
            {
                var errors = action.ModelState.Where(entry => entry.Value?.Errors.Count > 0)
                    .ToDictionary(entry => entry.Key, entry =>
                        entry.Value!.Errors.Select(_ => "请检查字段格式和长度。").ToArray());

                return new BadRequestObjectResult(ApiError.Create(action.HttpContext,
                    "VALIDATION_FAILED", "请检查输入内容。", errors));
            };
        });
        return services;
    }
}
