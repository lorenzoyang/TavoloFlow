using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/owner/subscription/notices")]
[Authorize(Policy = StoreAuthentication.OwnerPolicy)]
public sealed class OwnerSubscriptionNoticesController(
    SubscriptionNotices notices,
    CurrentAccount current
) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read(CancellationToken ct)
    {
        var owner = current.RequireUser();
        return Ok(await notices.ReadAsync(owner.Id, owner.RestaurantId, ct));
    }

    [HttpPost("acknowledge")]
    public async Task<IActionResult> Acknowledge(
        SubscriptionAcknowledgeInput input,
        CancellationToken ct
    )
    {
        await notices.AcknowledgeOwnerAsync(current.RequireUser().RestaurantId, input.Ids, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/platform/subscription-notices")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformSubscriptionNoticesController(
    SubscriptionNotices notices,
    CurrentPlatformAccount current
) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read(CancellationToken ct) =>
        Ok(await notices.ReadAsync(current.RequireUser().Id, null, ct));

    [HttpPost("acknowledge")]
    public async Task<IActionResult> Acknowledge(
        SubscriptionAcknowledgeInput input,
        CancellationToken ct
    )
    {
        await notices.AcknowledgePlatformAsync(current.RequireUser().Id, input.Ids, ct);
        return NoContent();
    }
}
