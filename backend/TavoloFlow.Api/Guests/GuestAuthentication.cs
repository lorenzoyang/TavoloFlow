using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Guests;

public sealed record GuestIdentity(Guid RestaurantId, Guid TableId, Guid SessionId)
{
    public static GuestIdentity Require(ClaimsPrincipal user)
    {
        var identity = user.Identities.SingleOrDefault(x => x.AuthenticationType == GuestAuthentication.Scheme);
        if (identity?.IsAuthenticated != true ||
            !Guid.TryParse(identity.FindFirst("restaurant_id")?.Value, out var restaurant) ||
            !Guid.TryParse(identity.FindFirst("table_id")?.Value, out var table) ||
            !Guid.TryParse(identity.FindFirst("session_id")?.Value, out var session))
            throw GuestErrors.AuthRequired();
        return new(restaurant, table, session);
    }
}

public static class GuestAuthentication
{
    public const string Scheme = BrowserSecurity.GuestScheme;
    public const string Policy = "GuestAccess";
    public const string CookieName = "TavoloFlow.Guest";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(12);

    public static Task SignInAsync(HttpContext http, GuestIdentity guest, TimeProvider clock)
    {
        var now = clock.GetUtcNow();
        var identity = new ClaimsIdentity([
            // Per-issuance identifier also binds CSRF tokens to this browser's current guest identity.
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new Claim("restaurant_id", guest.RestaurantId.ToString()),
            new Claim("table_id", guest.TableId.ToString()),
            new Claim("session_id", guest.SessionId.ToString())
        ], Scheme);
        return http.SignInAsync(Scheme, new ClaimsPrincipal(identity), new AuthenticationProperties
        {
            IsPersistent = false, AllowRefresh = false, IssuedUtc = now, ExpiresUtc = now + Lifetime
        });
    }

    // The Guest identity: a session-bound cookie scoped to /api/public, plus join verification.
    public static IServiceCollection AddGuestAccess(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddScoped<GuestService>();
        services.AddOptions<GuestRateLimitOptions>().Bind(configuration.GetSection("GuestRateLimits"))
            .ValidateDataAnnotations().ValidateOnStart();
        services.AddSingleton<GuestRateLimiter>();
        services.AddAuthentication().AddCookie(Scheme, options =>
        {
            options.Cookie.Name = CookieName;
            options.Cookie.Path = "/api/public";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = BrowserSecurity.CookiePolicy(environment);
            options.ExpireTimeSpan = Lifetime;
            options.SlidingExpiration = false;
            options.Events = new CookieAuthenticationEvents
            {
                OnRedirectToLogin = ctx => ApiError.WriteAsync(ctx.HttpContext, 401, "GUEST_AUTH_REQUIRED", "请验证本轮入桌码。"),
                OnRedirectToAccessDenied = ctx => ApiError.WriteAsync(ctx.HttpContext, 403, "GUEST_ACCESS_DENIED", "无法访问本轮用餐。")
            };
        });
        services.AddAuthorization(options => options.AddPolicy(Policy, policy =>
            policy.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser()));
        return services;
    }
}
