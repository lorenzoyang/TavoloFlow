using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Controllers;

// The shared option library. The menu read (GET /api/staff/menu) returns the groups with the dishes.
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class MenuOptionsController(MenuOptionService options, CurrentAccount current)
    : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    // Like a dish's sold-out switch, STAFF can mark a single option (a topping that ran out) sold out.
    [HttpPatch("api/staff/menu-options/{id:guid}/availability")]
    public async Task<IActionResult> Availability(
        Guid id,
        AvailabilityInput input,
        CancellationToken ct
    ) => Ok(await options.SetAvailabilityAsync(RestaurantId, id, input.IsAvailable!.Value, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPost("api/owner/menu/option-groups")]
    public async Task<IActionResult> CreateGroup(OptionGroupInput input, CancellationToken ct) =>
        StatusCode(201, await options.SaveGroupAsync(RestaurantId, null, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/menu/option-groups/{id:guid}")]
    public async Task<IActionResult> UpdateGroup(
        Guid id,
        OptionGroupInput input,
        CancellationToken ct
    ) => Ok(await options.SaveGroupAsync(RestaurantId, id, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpDelete("api/owner/menu/option-groups/{id:guid}")]
    public async Task<IActionResult> DeleteGroup(Guid id, CancellationToken ct)
    {
        await options.DeleteGroupAsync(RestaurantId, id, ct);
        return NoContent();
    }

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/menu/option-groups/order")]
    public async Task<IActionResult> ReorderGroups(
        OptionGroupOrderInput input,
        CancellationToken ct
    )
    {
        await options.ReorderGroupsAsync(RestaurantId, input.GroupIds, ct);
        return NoContent();
    }
}
