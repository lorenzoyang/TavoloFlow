using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public static class StoreAuthentication
{
    public const string Scheme = BrowserSecurity.StoreScheme;
    public const string CookieName = "TavoloFlow.Store";
    public const string AccountPolicy = "StoreAccount";
    public const string StaffPolicy = "StoreStaff";
    public const string OwnerPolicy = "StoreOwner";
    public const string RestaurantClaim = "restaurant_id";
    public const string VersionClaim = "credential_version";
    public const string PasswordChangeClaim = "must_change_password";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(16);

    public static Task SignInAsync(HttpContext context, RestaurantUser user, TimeProvider timeProvider)
    {
        var now = timeProvider.GetUtcNow();
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, ApiEnum.Text(user.Role)),
            new Claim(RestaurantClaim, user.RestaurantId.ToString()),
            new Claim(VersionClaim, user.CredentialVersion.ToString(CultureInfo.InvariantCulture)),
            new Claim(PasswordChangeClaim, user.MustChangePassword ? "true" : "false")
        ], Scheme);

        return context.SignInAsync(Scheme, new ClaimsPrincipal(identity), new AuthenticationProperties
        {
            IsPersistent = false,
            AllowRefresh = false,
            IssuedUtc = now,
            ExpiresUtc = now + Lifetime
        });
    }
}

public sealed class StoreCookieEvents(ApplicationDbContext context, CurrentAccount currentAccount)
    : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext cookieContext)
    {
        var principal = cookieContext.Principal;
        if (!Guid.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            !Guid.TryParse(principal.FindFirstValue(StoreAuthentication.RestaurantClaim), out var restaurantId) ||
            !int.TryParse(principal.FindFirstValue(StoreAuthentication.VersionClaim), out var version))
        {
            await RejectAsync(cookieContext);
            return;
        }

        var user = await context.RestaurantUsers.AsNoTracking().Include(user => user.Restaurant)
            .SingleOrDefaultAsync(user => user.Id == userId && user.RestaurantId == restaurantId,
                cookieContext.HttpContext.RequestAborted);
        if (user is null || !user.IsActive || user.CredentialVersion != version ||
            principal.FindFirstValue(ClaimTypes.Role) != ApiEnum.Text(user.Role) ||
            principal.FindFirstValue(ClaimTypes.Name) != user.Username)
        {
            await RejectAsync(cookieContext);
            return;
        }

        // Password-change policy always uses the latest state, even if an administrator changed it.
        var identity = (ClaimsIdentity)principal.Identity!;
        foreach (var claim in identity.FindAll(StoreAuthentication.PasswordChangeClaim).ToArray())
        {
            identity.RemoveClaim(claim);
        }
        identity.AddClaim(new Claim(StoreAuthentication.PasswordChangeClaim,
            user.MustChangePassword ? "true" : "false"));
        currentAccount.User = user;
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context) =>
        ApiError.WriteAsync(context.HttpContext, StatusCodes.Status401Unauthorized,
            "UNAUTHENTICATED", "请先登录。");

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context) =>
        ApiError.WriteAsync(context.HttpContext, StatusCodes.Status403Forbidden,
            "FORBIDDEN", "没有执行此操作的权限。");

    private static async Task RejectAsync(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(StoreAuthentication.Scheme);
    }
}
