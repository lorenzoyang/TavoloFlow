using System.Globalization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;

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
        var wait = rateLimiter.CheckLogin(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            AccountInput.NormalizeUsername(request.Username));
        if (wait is not null)
        {
            return TooManyRequests(wait.Value);
        }

        var user = await accounts.AuthenticateAsync(request.Username, request.Password, cancellationToken);
        if (user is null)
        {
            return Unauthorized(ApiError.Create(HttpContext, "INVALID_CREDENTIALS", "用户名或密码不正确。"));
        }
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);
        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(CurrentAccountResponse.From(current.RequireUser()));

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var user = current.RequireUser();
        var wait = rateLimiter.CheckPasswordChange(user.Id);
        if (wait is not null)
        {
            return TooManyRequests(wait.Value);
        }
        if (!AccountInput.IsValidPassword(request.NewPassword))
        {
            return BadRequest(ApiError.Create(HttpContext, "VALIDATION_FAILED", "新密码须为 12–128 个字符。",
                new Dictionary<string, string[]> { ["newPassword"] = ["密码不能全部为空白。"] }));
        }

        var result = await accounts.ChangePasswordAsync(user, request.CurrentPassword,
            request.NewPassword, cancellationToken);
        if (result == PasswordChangeResult.IncorrectPassword)
        {
            return BadRequest(ApiError.Create(HttpContext, "CURRENT_PASSWORD_INCORRECT", "当前密码不正确。"));
        }
        if (result == PasswordChangeResult.SamePassword)
        {
            return BadRequest(ApiError.Create(HttpContext, "PASSWORD_UNCHANGED", "新密码须与当前密码不同。"));
        }
        if (result == PasswordChangeResult.CredentialsChanged)
        {
            return Conflict(ApiError.Create(HttpContext, "CREDENTIALS_CHANGED", "账号凭据已变化，请重新登录。"));
        }
        await StoreAuthentication.SignInAsync(HttpContext, user, timeProvider);
        return Ok(CurrentAccountResponse.From(user));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(StoreAuthentication.Scheme);
        return NoContent();
    }

    private ObjectResult TooManyRequests(int seconds)
    {
        Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        return StatusCode(StatusCodes.Status429TooManyRequests,
            ApiError.Create(HttpContext, "RATE_LIMITED", $"操作过于频繁，请在 {seconds} 秒后重试。"));
    }
}
