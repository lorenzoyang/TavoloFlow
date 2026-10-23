using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Authorize(Policy = StoreAuthentication.AccountPolicy)]
public sealed class AuthController(
    AccountService accounts,
    CurrentAccount current,
    IAntiforgery antiforgery,
    AccountRateLimiter rateLimiter,
    TimeProvider timeProvider) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("csrf")]
    public IActionResult Csrf() =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        rateLimiter.EnsureLoginAllowed(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            AccountInput.NormalizeUsername(request.Username));

        var user = await accounts.AuthenticateAsync(request.Username, request.Password, cancellationToken)
            ?? throw new ApiException(StatusCodes.Status401Unauthorized, "INVALID_CREDENTIALS", "用户名或密码不正确。");
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);
        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(CurrentAccountResponse.From(current.RequireUser()));

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var user = current.RequireUser();
        rateLimiter.EnsurePasswordChangeAllowed(user.Id);
        AccountInput.EnsureValidNewPassword(request.NewPassword);

        var result = await accounts.ChangePasswordAsync(user, request.CurrentPassword,
            request.NewPassword, cancellationToken);
        result.EnsureChanged("账号凭据已变化，请重新登录。");
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);
        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(StoreAuthentication.Scheme);
        return NoContent();
    }
}
