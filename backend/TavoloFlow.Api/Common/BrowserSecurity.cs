using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TavoloFlow.Api.Common;

// One browser can hold three independent identities at once. 
// The request path alone decides which one a request uses: 
// /api/platform -> Platform, /api/public -> Guest, everything else -> Store.
public static class BrowserSecurity
{
    public const string DefaultScheme = "Browser";
    public const string StoreScheme = "Store";
    public const string GuestScheme = "Guest";
    public const string PlatformScheme = "Platform";

    public static string SchemeFor(PathString path) =>
        path.StartsWithSegments("/api/platform") ? PlatformScheme
        : path.StartsWithSegments("/api/public") ? GuestScheme
        : StoreScheme;

    // Outside Development every cookie requires HTTPS; locally the Vite proxy uses plain HTTP.
    public static CookieSecurePolicy CookiePolicy(IHostEnvironment environment) =>
        environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;

    // Each identity module then adds its own cookie scheme and authorization policies.
    public static IServiceCollection AddBrowserSecurity(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        // Protects cookies, antiforgery tokens and join codes. 
        // Without DataProtection:KeyRingPath the keys live in the framework's per-user directory; 
        // losing them invalidates logins and active join codes.
        var protection = services.AddDataProtection().SetApplicationName("TavoloFlow");
        var keyRingPath = configuration["DataProtection:KeyRingPath"];
        if (!string.IsNullOrWhiteSpace(keyRingPath))
        {
            protection.PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));
        }

        // HttpContext.User comes from the identity that owns the path, which also scopes CSRF tokens.
        services
            .AddAuthentication(DefaultScheme)
            .AddPolicyScheme(
                DefaultScheme,
                null,
                options => options.ForwardDefaultSelector = http => SchemeFor(http.Request.Path)
            );

        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "TavoloFlow.Csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = CookiePolicy(environment);
        });
        services.AddSingleton<IAntiforgeryAdditionalDataProvider, BrowserCsrfScope>();

        return services;
    }
}

// Binds every CSRF token, even an anonymous login token, to the identity scope of its path,
// so a token fetched for one identity never validates a write for another.
public sealed class BrowserCsrfScope : IAntiforgeryAdditionalDataProvider
{
    public string GetAdditionalData(HttpContext context) =>
        BrowserSecurity.SchemeFor(context.Request.Path).ToLowerInvariant();

    public bool ValidateAdditionalData(HttpContext context, string additionalData) =>
        additionalData == GetAdditionalData(context);
}

// Registered globally: AddControllers does not validate antiforgery tokens for JSON requests by itself.
public sealed class CsrfValidationFilter(IAntiforgery antiforgery) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var method = context.HttpContext.Request.Method;
        if (
            HttpMethods.IsGet(method)
            || HttpMethods.IsHead(method)
            || HttpMethods.IsOptions(method)
        )
        {
            return;
        }
        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            context.Result = new BadRequestObjectResult(
                ApiError.Create(
                    context.HttpContext,
                    "CSRF_VALIDATION_FAILED",
                    "页面验证已失效，请刷新后重试。"
                )
            );
        }
    }
}
