using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/platform/auth")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformAuthController(
    PlatformAccountService service,
    CurrentPlatformAccount current,
    IAntiforgery antiforgery,
    [FromKeyedServices(PlatformAuthentication.Scheme)] AccountRateLimiter limiter,
    TimeProvider clock,
    PlatformPushDevices devices
) : ControllerBase
{
    [AllowAnonymous, HttpGet("csrf")]
    public IActionResult Csrf() =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest input, CancellationToken ct)
    {
        limiter.EnsureLoginAllowed(
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            AccountInput.NormalizeUsername(input.Username)
        );
        var user =
            await service.AuthenticateAsync(input.Username, input.Password, ct)
            ?? throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "INVALID_CREDENTIALS",
                "Wrong username or password."
            );
        await PlatformAuthentication.SignInAsync(HttpContext, user, clock);
        return Ok(PlatformIdentityResponse.From(user));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(PlatformIdentityResponse.From(current.RequireUser()));

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(
        [FromBody(
            EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow
        )]
            LogoutRequest? input,
        CancellationToken ct
    )
    {
        if (input?.PushEndpoint is { } endpoint)
            await devices.RemoveAsync(current.RequireUser().Id, endpoint, ct);
        await HttpContext.SignOutAsync(PlatformAuthentication.Scheme);
        return NoContent();
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest input,
        CancellationToken ct
    )
    {
        var user = current.RequireUser();
        limiter.EnsurePasswordChangeAllowed(user.Id);
        AccountInput.EnsureValidNewPassword(input.NewPassword);
        var result = await service.ChangePasswordAsync(
            user,
            input.CurrentPassword,
            input.NewPassword,
            ct
        );
        result.EnsureChanged("Your platform credentials have changed. Sign in again.");
        await PlatformAuthentication.SignInAsync(HttpContext, user, clock);
        return Ok(PlatformIdentityResponse.From(user));
    }
}
