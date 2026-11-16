using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Controllers;

// Anonymous online ordering. The submission still needs a CSRF token from /api/public/csrf.
// Select Guest explicitly so the Store fallback cannot replace the public CSRF identity.
[ApiController]
[Authorize(Policy = GuestAuthentication.Policy)]
[AllowAnonymous]
public sealed class OnlineOrderController(
    OnlineMenuService menus,
    OnlineRequestService requests,
    OnlineOrderStatusService statuses,
    OnlineBrowser browser
) : ControllerBase
{
    [HttpGet("api/public/r/{slug}/bootstrap")]
    [OnlineLimit(OnlineLimit.Menu)]
    public async Task<IActionResult> Menu(string slug, CancellationToken ct) =>
        Ok(await menus.ReadAsync(slug, ct));

    [HttpGet("api/public/r/{slug}/coupons/{code}")]
    [OnlineLimit(OnlineLimit.Coupon)]
    public async Task<IActionResult> Coupon(string slug, string code, CancellationToken ct) =>
        Ok(await menus.CouponAsync(slug, code, ct));

    [HttpGet("api/public/r/{slug}/ordering-context")]
    [OnlineLimit(OnlineLimit.Context)]
    public async Task<IActionResult> Context(string slug, CancellationToken ct) =>
        Ok(await requests.ContextAsync(slug, browser.GetOrCreate(HttpContext), ct));

    [HttpPost("api/public/r/{slug}/requests")]
    [OnlineLimit(OnlineLimit.Submission)]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> Submit(
        string slug,
        OnlineRequestInput input,
        CancellationToken ct
    )
    {
        var result = await requests.SubmitAsync(slug, input, browser.Require(HttpContext), ct);
        return StatusCode(result.Created ? 201 : 200, result.Response);
    }

    [HttpGet("api/public/r/{slug}/requests/by-client-id/{clientRequestId:guid}")]
    [OnlineLimit(OnlineLimit.Recovery)]
    public async Task<IActionResult> ByClientRequest(
        string slug,
        Guid clientRequestId,
        CancellationToken ct
    ) => Ok(await requests.ByClientRequestAsync(slug, clientRequestId, ct));

    [HttpGet("api/public/online-orders/{token}")]
    [OnlineLimit(OnlineLimit.Status)]
    public async Task<IActionResult> Status(string token, CancellationToken ct) =>
        Ok(await statuses.ReadAsync(token, ct));
}
