using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Guests;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = GuestAuthentication.Policy)]
public sealed class GuestController(
    GuestService guests,
    IAntiforgery antiforgery,
    GuestRateLimiter limiter,
    TimeProvider clock,
    ILogger<GuestController> logger
) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("api/public/csrf")]
    public IActionResult Csrf() =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous]
    [HttpPost("api/public/qr/{token}/join")]
    public async Task<IActionResult> Join(string token, JoinInput input, CancellationToken ct)
    {
        var wait = limiter.Check(
            HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            input.SessionId!.Value
        );

        if (wait is not null)
        {
            logger.LogWarning(
                "Guest join rate limit reached. Request {RequestId}.",
                HttpContext.TraceIdentifier
            );
            throw ApiException.RateLimited(wait.Value, "验证过于频繁，请稍后再试。");
        }

        var guest = await guests.JoinAsync(token, input, ct);
        await GuestAuthentication.SignInAsync(HttpContext, guest, clock);
        
        return Ok(new JoinResponse(guest.RestaurantId, guest.TableId, guest.SessionId));
    }

    [HttpGet("api/public/sessions/{id:guid}/access")]
    public async Task<IActionResult> Access(Guid id, CancellationToken ct) =>
        Ok(await guests.AccessAsync(GuestIdentity.Require(User), id, ct));

    [HttpGet("api/public/sessions/{id:guid}/join-code")]
    public async Task<IActionResult> Code(Guid id, CancellationToken ct) =>
        Ok(await guests.ReadCodeAsync(GuestIdentity.Require(User), id, ct));
}
