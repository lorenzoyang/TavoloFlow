using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Kitchen;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class KitchenController(KitchenService kitchen, CurrentAccount current)
    : ControllerBase
{
    [HttpGet("api/staff/orders")]
    public async Task<IActionResult> List(
        CancellationToken ct,
        [FromQuery] string status = "NEW",
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) => Ok(await kitchen.ListAsync(current.RequireUser().RestaurantId, status, cursor, limit, ct));

    [HttpGet("api/staff/orders/{id:guid}")]
    public async Task<IActionResult> Read(Guid id, CancellationToken ct) =>
        Ok(await kitchen.ReadAsync(current.RequireUser().RestaurantId, id, ct));

    [HttpPost("api/staff/orders/{id:guid}/items/{itemId:guid}/ready")]
    public async Task<IActionResult> Ready(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchen.ReadyAsync(current.RequireUser().RestaurantId, id, itemId, ct));

    [HttpPost("api/staff/orders/{id:guid}/items/{itemId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchen.CancelAsync(current.RequireUser().RestaurantId, id, itemId, ct));

    [HttpGet("api/staff/pass")]
    public async Task<IActionResult> Pass(
        CancellationToken ct,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) => Ok(await kitchen.PassAsync(current.RequireUser().RestaurantId, cursor, limit, ct));

    [HttpPost("api/staff/orders/{id:guid}/items/{itemId:guid}/served")]
    public async Task<IActionResult> Served(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchen.ServedAsync(current.RequireUser().RestaurantId, id, itemId, ct));
}
