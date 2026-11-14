using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Controllers;

// Lock-screen notifications of new online orders, registered per device by STAFF and OWNER.
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
[Route("api/staff/push")]
public sealed class PushController(PushSubscriptionService service, CurrentAccount current)
    : ControllerBase
{
    [HttpGet("key")]
    public IActionResult Key() => Ok(service.Key());

    [HttpPut("subscription")]
    public async Task<IActionResult> Save(PushSubscriptionInput input, CancellationToken ct)
    {
        // The store cookie is persistent, so its ticket always carries an expiry.
        var expiresAt =
            current.TicketExpiresAt
            ?? throw new InvalidOperationException("The store sign-in has no expiry.");
        await service.SaveAsync(current.RequireUser(), expiresAt, input, ct);
        return NoContent();
    }

    [HttpDelete("subscription")]
    public async Task<IActionResult> Remove(PushEndpointInput input, CancellationToken ct)
    {
        await service.RemoveAsync(current.RequireUser().RestaurantId, input.Endpoint, ct);
        return NoContent();
    }
}
