using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Controllers;

// Anonymous online ordering. The submission still needs a CSRF token from /api/public/csrf.
[ApiController]
[AllowAnonymous]
public sealed class OnlineOrderController(
    OnlineMenuService menus,
    OnlineRequestService requests,
    OnlineOrderStatusService statuses,
    OnlineRateLimiter limiter,
    ILogger<OnlineOrderController> logger
) : ControllerBase
{
    [HttpGet("api/public/r/{slug}/bootstrap")]
    public async Task<IActionResult> Menu(string slug, CancellationToken ct) =>
        Ok(await menus.ReadAsync(slug, ct));

    [HttpPost("api/public/r/{slug}/requests")]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> Submit(
        string slug,
        OnlineRequestInput input,
        CancellationToken ct
    )
    {
        var wait = limiter.Check(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");
        if (wait is not null)
        {
            logger.LogWarning(
                "Online submission rate limit reached. Request {RequestId}.",
                HttpContext.TraceIdentifier
            );
            throw ApiException.RateLimited(
                wait.Value,
                "Too many online orders from this connection. Try again shortly."
            );
        }
        var result = await requests.SubmitAsync(slug, input, ct);
        return StatusCode(result.Created ? 201 : 200, result.Response);
    }

    [HttpGet("api/public/r/{slug}/requests/by-client-id/{clientRequestId:guid}")]
    public async Task<IActionResult> ByClientRequest(
        string slug,
        Guid clientRequestId,
        CancellationToken ct
    ) => Ok(await requests.ByClientRequestAsync(slug, clientRequestId, ct));

    [HttpGet("api/public/online-orders/{token}")]
    public async Task<IActionResult> Status(string token, CancellationToken ct) =>
        Ok(await statuses.ReadAsync(token, ct));
}
