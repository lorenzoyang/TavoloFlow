using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[MenuErrors]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class MenuController(MenuService menus, CurrentAccount current) : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/menu")]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await menus.ReadAsync(RestaurantId, ct));

    [HttpPatch("api/staff/menu-items/{id:guid}/availability")]
    public async Task<IActionResult> Availability(Guid id, AvailabilityInput input, CancellationToken ct) =>
        Ok(await menus.SetAvailabilityAsync(RestaurantId, id, input.IsAvailable!.Value, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPost("api/owner/menu/categories")]
    public async Task<IActionResult> CreateCategory(CategoryInput input, CancellationToken ct) =>
        StatusCode(201, await menus.SaveCategoryAsync(RestaurantId, null, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/menu/categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, CategoryInput input, CancellationToken ct) =>
        Ok(await menus.SaveCategoryAsync(RestaurantId, id, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpDelete("api/owner/menu/categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken ct)
    {
        await menus.DeleteCategoryAsync(RestaurantId, id, ct);
        return NoContent();
    }

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPost("api/owner/menu/items")]
    public async Task<IActionResult> CreateItem(MenuItemInput input, CancellationToken ct) =>
        StatusCode(201, await menus.SaveItemAsync(RestaurantId, null, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPut("api/owner/menu/items/{id:guid}")]
    public async Task<IActionResult> UpdateItem(Guid id, MenuItemInput input, CancellationToken ct) =>
        Ok(await menus.SaveItemAsync(RestaurantId, id, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpDelete("api/owner/menu/items/{id:guid}")]
    public async Task<IActionResult> DeleteItem(Guid id, CancellationToken ct)
    {
        await menus.DeleteItemAsync(RestaurantId, id, ct);
        return NoContent();
    }

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPatch("api/owner/menu/default-language")]
    public async Task<IActionResult> DefaultLanguage(DefaultLanguageInput input, CancellationToken ct) =>
        Ok(await menus.SetDefaultLanguageAsync(RestaurantId, input.DefaultLanguage, ct));
}
