using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Controllers;

// The staff online orders page and banner: STAFF and OWNER both accept and reject.
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class OnlineOrdersController(
    OnlineStaffService service,
    BillingService billing,
    CurrentAccount current
) : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/online/pending")]
    public async Task<IActionResult> Pending(CancellationToken ct) =>
        Ok(await service.PendingAsync(RestaurantId, ct));

    [HttpGet("api/staff/online/active")]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await service.ActiveAsync(RestaurantId, ct));

    [HttpPost("api/staff/online/requests/{id:guid}/accept")]
    public async Task<IActionResult> Accept(
        Guid id,
        OnlineAcceptInput input,
        CancellationToken ct
    ) => Ok(await service.AcceptAsync(RestaurantId, id, input, ct));

    [HttpPost("api/staff/online/sessions/{id:guid}/cancel-reservation")]
    public async Task<IActionResult> CancelReservation(Guid id, CancellationToken ct)
    {
        await billing.CancelReservationAsync(RestaurantId, id, ct);
        return NoContent();
    }

    [HttpPost("api/staff/online/requests/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, OnlineRejectInput input, CancellationToken ct)
    {
        await service.RejectAsync(RestaurantId, id, input, ct);
        return NoContent();
    }
}
