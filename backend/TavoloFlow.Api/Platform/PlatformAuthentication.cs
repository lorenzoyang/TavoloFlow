using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public static class PlatformAuthentication
{
    public const string Scheme = "Platform";
    public const string Policy = "PlatformAdmin";
    public const string CookieName = "TavoloFlow.Platform";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    public static IServiceCollection AddPlatformAccounts(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddSingleton<IPasswordHasher<PlatformUser>, PasswordHasher<PlatformUser>>();
        services.AddSingleton<UnknownPlatformPassword>();
        services.AddScoped<PlatformAccountService>();
        services.AddScoped<PlatformBootstrap>();
        services.AddScoped<CurrentPlatformAccount>();
        services.AddScoped<PlatformCookieEvents>();
        services.AddOptions<AccountRateLimitOptions>(Scheme).Bind(configuration.GetSection("PlatformRateLimits"))
            .ValidateDataAnnotations().ValidateOnStart();
        services.AddSingleton<PlatformRateLimiter>();
        services.AddAuthentication().AddCookie(Scheme, options =>
        {
            options.Cookie.Name = CookieName;
            options.Cookie.Path = "/api/platform";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.ExpireTimeSpan = Lifetime;
            options.SlidingExpiration = false;
            options.EventsType = typeof(PlatformCookieEvents);
        });
        services.AddAuthorization(options => options.AddPolicy(Policy, policy =>
            policy.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser().RequireRole("PLATFORM_ADMIN")));
        return services;
    }

    public static Task SignInAsync(HttpContext http, PlatformUser user, TimeProvider clock)
    {
        var now = clock.GetUtcNow();
        var identity = new ClaimsIdentity([
            // A separate identifier namespace also prevents cross-scheme CSRF identity collisions.
            new Claim(ClaimTypes.NameIdentifier, $"platform:{user.Id}"),
            new Claim(ClaimTypes.Name, user.Username), new Claim(ClaimTypes.Role, "PLATFORM_ADMIN"),
            new Claim(StoreAuthentication.VersionClaim, user.CredentialVersion.ToString(CultureInfo.InvariantCulture))
        ], Scheme);
        return http.SignInAsync(Scheme, new ClaimsPrincipal(identity), new AuthenticationProperties
        { IsPersistent = false, AllowRefresh = false, IssuedUtc = now, ExpiresUtc = now + Lifetime });
    }
}

public sealed class CurrentPlatformAccount
{
    public PlatformUser? User { get; internal set; }
    public PlatformUser RequireUser() => User ?? throw new InvalidOperationException("A platform identity is required.");
}

public sealed record PlatformIdentityResponse(Guid UserId, string Username, string Role = "PLATFORM_ADMIN")
{
    public static PlatformIdentityResponse From(PlatformUser user) => new(user.Id, user.Username);
}

public sealed class PlatformCookieEvents(ApplicationDbContext db, CurrentPlatformAccount current) : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var subject = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        PlatformUser? user = null;
        if (subject?.StartsWith("platform:", StringComparison.Ordinal) == true &&
            Guid.TryParse(subject[9..], out var id) &&
            int.TryParse(context.Principal?.FindFirstValue(StoreAuthentication.VersionClaim), out var version))
        {
            user = await db.PlatformUsers.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, context.HttpContext.RequestAborted);
            if (user is not { IsActive: true } || user.CredentialVersion != version ||
                context.Principal?.FindFirstValue(ClaimTypes.Name) != user.Username ||
                context.Principal?.FindFirstValue(ClaimTypes.Role) != "PLATFORM_ADMIN") user = null;
        }
        if (user is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(PlatformAuthentication.Scheme);
        }
        else current.User = user;
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context) =>
        StoreCookieEvents.WriteErrorAsync(context.HttpContext, 401, "UNAUTHENTICATED", "请先登录平台。");
    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context) =>
        StoreCookieEvents.WriteErrorAsync(context.HttpContext, 403, "FORBIDDEN", "没有平台管理权限。");
}

public sealed class PlatformRateLimiter(IOptionsMonitor<AccountRateLimitOptions> options) : IDisposable
{
    public AccountRateLimiter Limiter { get; } = new(Options.Create(options.Get(PlatformAuthentication.Scheme)));
    public void Dispose() => Limiter.Dispose();
}
