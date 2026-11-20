using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
[Route("api/staff/sessions/{id:guid}/orders")]
public sealed class StaffOrderController(OrderService orders, CurrentAccount current)
    : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpPost]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> Create(
        Guid id,
        CreateStaffOrderInput input,
        CancellationToken ct
    )
    {
        var result = await orders.CreateForStaffAsync(RestaurantId, id, input, ct);
        return StatusCode(result.Created ? 201 : 200, result.Order);
    }

    [HttpGet("by-request/{requestId:guid}")]
    public async Task<IActionResult> ByRequest(Guid id, Guid requestId, CancellationToken ct) =>
        Ok(await orders.StaffOrderByRequestAsync(RestaurantId, id, requestId, ct));
}
