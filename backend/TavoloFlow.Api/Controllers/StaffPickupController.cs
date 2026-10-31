using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Pickup;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class StaffPickupController(PickupSettingsService settings, PickupDeskService desk, CurrentAccount current)
    : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/pickup/settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) => Ok(await settings.ReadAsync(RestaurantId, ct));

    [HttpPatch("api/staff/pickup/paused")]
    public async Task<IActionResult> Paused(PickupPausedInput input, CancellationToken ct) =>
        Ok(await settings.SetPausedAsync(RestaurantId, input.Paused!.Value, ct));

    [HttpGet("api/staff/pickup/pending")]
    public async Task<IActionResult> Pending(CancellationToken ct) => Ok(await desk.PendingAsync(RestaurantId, ct));

    [HttpPost("api/staff/pickup/requests/{id:guid}/accept")]
    public async Task<IActionResult> Accept(Guid id, AcceptPickupInput input, CancellationToken ct) =>
        Ok(await desk.AcceptAsync(RestaurantId, id, input.EstimatedMinutes, ct));

    [HttpPost("api/staff/pickup/requests/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, RejectPickupInput input, CancellationToken ct)
    {
        await desk.RejectAsync(RestaurantId, id, input.Reason, ct);
        return NoContent();
    }

    [HttpGet("api/staff/pickup/unaccepted")]
    public async Task<IActionResult> Unaccepted(CancellationToken ct) => Ok(await desk.UnacceptedAsync(RestaurantId, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/pickup/hours")]
    public async Task<IActionResult> Hours(PickupHoursInput input, CancellationToken ct) =>
        Ok(await settings.SaveHoursAsync(RestaurantId, input.Hours, ct));
}
