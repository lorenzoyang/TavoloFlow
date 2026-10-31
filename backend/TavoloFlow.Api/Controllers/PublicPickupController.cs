using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Pickup;

namespace TavoloFlow.Api.Controllers;

// Anonymous like the QR bootstrap; the submission still needs the /api/public CSRF token.
[ApiController]
[AllowAnonymous]
public sealed class PublicPickupController(PickupOrderService pickup, PickupRateLimiter limiter,
    ILogger<PublicPickupController> logger) : ControllerBase
{
    [HttpGet("api/public/r/{slug}/bootstrap")]
    public async Task<IActionResult> Menu(string slug, CancellationToken ct) => Ok(await pickup.MenuAsync(slug, ct));

    [HttpPost("api/public/r/{slug}/pickup-requests")]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> Submit(string slug, PickupRequestInput input, CancellationToken ct)
    {
        var wait = limiter.Check(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");
        if (wait is not null)
        {
            logger.LogWarning("Pickup submission rate limit reached. Request {RequestId}.", HttpContext.TraceIdentifier);
            throw ApiException.RateLimited(wait.Value, "提交过于频繁，请稍后再试。");
        }
        var result = await pickup.SubmitAsync(slug, input, ct);
        return StatusCode(result.Created ? 201 : 200, result.Response);
    }

    [HttpGet("api/public/r/{slug}/pickup-requests/by-client-id/{clientRequestId:guid}")]
    public async Task<IActionResult> ByClientId(string slug, Guid clientRequestId, CancellationToken ct) =>
        Ok(await pickup.ByClientIdAsync(slug, clientRequestId, ct));

    [HttpGet("api/public/pickup-requests/{token}")]
    public async Task<IActionResult> Status(string token, CancellationToken ct) => Ok(await pickup.StatusAsync(token, ct));
}
