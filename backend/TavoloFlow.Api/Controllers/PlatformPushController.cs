using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/platform/push")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformPushController(
    PlatformPushDevices devices,
    CurrentPlatformAccount current
) : ControllerBase
{
    [HttpGet("key")]
    public IActionResult Key() => Ok(devices.Key());

    [HttpPut("subscription")]
    public async Task<IActionResult> Save(PushSubscriptionInput input, CancellationToken ct)
    {
        var expires =
            current.TicketExpiresAt
            ?? throw new ApiException(
                401,
                "UNAUTHENTICATED",
                "Sign in again to register this device."
            );
        await devices.SaveAsync(current.RequireUser(), expires, input, ct);
        return NoContent();
    }

    [HttpDelete("subscription")]
    public async Task<IActionResult> Remove(PushEndpointInput input, CancellationToken ct)
    {
        await devices.RemoveAsync(current.RequireUser().Id, input.Endpoint, ct);
        return NoContent();
    }
}
