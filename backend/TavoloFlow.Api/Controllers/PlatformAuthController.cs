using System.Globalization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/platform/auth")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformAuthController(PlatformAccountService service, CurrentPlatformAccount current,
    IAntiforgery antiforgery, PlatformRateLimiter limiter, TimeProvider clock) : ControllerBase
{
    [AllowAnonymous, HttpGet("csrf")]
    public IActionResult Csrf() => Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest input, CancellationToken ct)
    {
        var wait = limiter.Limiter.CheckLogin(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            AccountInput.NormalizeUsername(input.Username));
        if (wait is not null) return Limited(wait.Value);
        var user = await service.AuthenticateAsync(input.Username, input.Password, ct);
        if (user is null) return Unauthorized(ApiError.Create(HttpContext, "INVALID_CREDENTIALS", "用户名或密码不正确。"));
        await PlatformAuthentication.SignInAsync(HttpContext, user, clock);
        return Ok(PlatformIdentityResponse.From(user));
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(PlatformIdentityResponse.From(current.RequireUser()));

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(PlatformAuthentication.Scheme);
        return NoContent();
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest input, CancellationToken ct)
    {
        var user = current.RequireUser();
        var wait = limiter.Limiter.CheckPasswordChange(user.Id);
        if (wait is not null) return Limited(wait.Value);
        if (!AccountInput.IsValidPassword(input.NewPassword))
            return BadRequest(ApiError.Create(HttpContext, "VALIDATION_FAILED", "新密码须为 12–128 个字符且不能全部为空白。"));
        var result = await service.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword, ct);
        if (result == PasswordChangeResult.IncorrectPassword)
            return BadRequest(ApiError.Create(HttpContext, "CURRENT_PASSWORD_INCORRECT", "当前密码不正确。"));
        if (result == PasswordChangeResult.SamePassword)
            return BadRequest(ApiError.Create(HttpContext, "PASSWORD_UNCHANGED", "新密码须与当前密码不同。"));
        if (result == PasswordChangeResult.CredentialsChanged)
            return Conflict(ApiError.Create(HttpContext, "CREDENTIALS_CHANGED", "平台凭据已变化，请重新登录。"));
        await PlatformAuthentication.SignInAsync(HttpContext, user, clock);
        return Ok(PlatformIdentityResponse.From(user));
    }

    private ObjectResult Limited(int wait)
    {
        Response.Headers.RetryAfter = wait.ToString(CultureInfo.InvariantCulture);
        return StatusCode(429, ApiError.Create(HttpContext, "RATE_LIMITED", $"操作过于频繁，请在 {wait} 秒后重试。"));
    }
}
