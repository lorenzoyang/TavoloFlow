using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = GuestAuthentication.Policy)]
public sealed class OrderController(OrderService orders) : ControllerBase
{
    [HttpPost("api/public/orders")]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> Create(CreateOrderInput input, CancellationToken ct)
    {
        var result = await orders.CreateAsync(GuestIdentity.Require(User), input, ct);
        return StatusCode(result.Created ? 201 : 200, result.Order);
    }

    [HttpGet("api/public/sessions/{id:guid}/orders")]
    public async Task<IActionResult> List(
        Guid id,
        CancellationToken ct,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) => Ok(await orders.ListAsync(GuestIdentity.Require(User), id, cursor, limit, ct));

    [HttpGet("api/public/sessions/{id:guid}/orders/by-request/{requestId:guid}")]
    public async Task<IActionResult> ByRequest(Guid id, Guid requestId, CancellationToken ct) =>
        Ok(await orders.ByRequestAsync(GuestIdentity.Require(User), id, requestId, ct));
}
