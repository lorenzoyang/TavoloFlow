using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

// Read-only: the platform manages the subscription; the owner sees only its own restaurant.
[ApiController]
[Route("api/owner/subscription")]
[Authorize(Policy = StoreAuthentication.OwnerPolicy)]
public sealed class OwnerSubscriptionController(SubscriptionService service, CurrentAccount current)
    : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read(CancellationToken ct) =>
        Ok(await service.ReadAsync(current.RequireUser().RestaurantId, ct));
}
