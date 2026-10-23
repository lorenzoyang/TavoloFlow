using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/owner/staff")]
[Authorize(Policy = StoreAuthentication.OwnerPolicy)]
public sealed class OwnerStaffController(RestaurantAdministration service, CurrentAccount current) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Staff(CancellationToken ct) => Ok(await service.StaffAsync(current.RequireUser().RestaurantId, ct));
    [HttpPost("reset-password")]
    public async Task<IActionResult> Reset(ResetAccountInput input, CancellationToken ct)
    {
        var owner = current.RequireUser();
        var staff = await service.StaffAsync(owner.RestaurantId, ct);
        return Ok(await service.ResetAsync(owner.RestaurantId, staff.Id, input.ExpectedCredentialVersion!.Value, $"owner:{owner.Id}", ct));
    }
}
