using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[OrderErrors]
[DiningErrors]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class KitchenController(KitchenService kitchen, CurrentAccount current) : ControllerBase
{
    [HttpGet("api/staff/orders")]
    public async Task<IActionResult> List(CancellationToken ct, [FromQuery] string status = "NEW",
        [FromQuery] string? cursor = null, [FromQuery] int limit = 50) =>
        Ok(await kitchen.ListAsync(current.RequireUser().RestaurantId, status, cursor, limit, ct));

    [HttpGet("api/staff/orders/{id:guid}")]
    public async Task<IActionResult> Read(Guid id, CancellationToken ct) =>
        Ok(await kitchen.ReadAsync(current.RequireUser().RestaurantId, id, ct));

    [HttpPost("api/staff/orders/{id:guid}/ready")]
    public async Task<IActionResult> Ready(Guid id, CancellationToken ct) =>
        Ok(await kitchen.ReadyAsync(current.RequireUser().RestaurantId, id, ct));

    [HttpPost("api/staff/orders/{id:guid}/cancel")]
    [RequestSizeLimit(16_384)]
    public async Task<IActionResult> Cancel(Guid id, CancelOrderInput input, CancellationToken ct)
    {
        var user = current.RequireUser();
        return Ok(await kitchen.CancelAsync(user.RestaurantId, id, user.Role, input, ct));
    }
}
