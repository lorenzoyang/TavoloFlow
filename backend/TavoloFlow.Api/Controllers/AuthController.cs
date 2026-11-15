using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Authorize(Policy = StoreAuthentication.AccountPolicy)]
public sealed class AuthController(
    AccountService accounts,
    CurrentAccount current,
    IAntiforgery antiforgery,
    AccountRateLimiter rateLimiter,
    TimeProvider timeProvider,
    PushSubscriptionService push
) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("csrf")]
    public IActionResult Csrf() =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(
        LoginRequest request,
        CancellationToken cancellationToken
    )
    {
        rateLimiter.EnsureLoginAllowed(
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            AccountInput.NormalizeUsername(request.Username)
        );

        var user =
            await accounts.AuthenticateAsync(request.Username, request.Password, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "INVALID_CREDENTIALS",
                "Wrong username or password."
            );
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);

        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(CurrentAccountResponse.From(current.RequireUser()));

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken
    )
    {
        var user = current.RequireUser();
        rateLimiter.EnsurePasswordChangeAllowed(user.Id);
        AccountInput.EnsureValidNewPassword(request.NewPassword);

        var result = await accounts.ChangePasswordAsync(
            user,
            request.CurrentPassword,
            request.NewPassword,
            cancellationToken
        );
        result.EnsureChanged("Your credentials have changed. Sign in again.");
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);

        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(LogoutRequest request, CancellationToken ct)
    {
        // Revoke this device before clearing its cookie. A failed revocation leaves it signed in
        // so the caller can retry; the browser keeps its subscription for the next sign-in.
        if (request.PushEndpoint is not null)
            await push.RemoveAsync(current.RequireUser().RestaurantId, request.PushEndpoint, ct);
        await HttpContext.SignOutAsync(StoreAuthentication.Scheme);

        return NoContent();
    }
}
