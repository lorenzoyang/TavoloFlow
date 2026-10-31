using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Pickup;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class StaffPickupController(PickupSettingsService settings, CurrentAccount current) : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/pickup/settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) => Ok(await settings.ReadAsync(RestaurantId, ct));

    [HttpPatch("api/staff/pickup/paused")]
    public async Task<IActionResult> Paused(PickupPausedInput input, CancellationToken ct) =>
        Ok(await settings.SetPausedAsync(RestaurantId, input.Paused!.Value, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/pickup/hours")]
    public async Task<IActionResult> Hours(PickupHoursInput input, CancellationToken ct) =>
        Ok(await settings.SaveHoursAsync(RestaurantId, input.Hours, ct));
}
