using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Tables;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class TableController(TableService tables, CurrentAccount current) : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/tables")]
    public async Task<IActionResult> Get(CancellationToken ct) => Ok(await tables.ReadAsync(RestaurantId, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPost("api/owner/tables")]
    public async Task<IActionResult> Create(TableLabelInput input, CancellationToken ct) =>
        StatusCode(201, await tables.CreateAsync(RestaurantId, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPatch("api/owner/tables/{id:guid}/label")]
    public async Task<IActionResult> Rename(Guid id, TableLabelInput input, CancellationToken ct) =>
        Ok(await tables.RenameAsync(RestaurantId, id, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPatch("api/owner/tables/{id:guid}/enabled")]
    public async Task<IActionResult> Enabled(Guid id, TableEnabledInput input, CancellationToken ct) =>
        Ok(await tables.SetEnabledAsync(RestaurantId, id, input.IsEnabled!.Value, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpDelete("api/owner/tables/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await tables.DeleteAsync(RestaurantId, id, ct);
        return NoContent();
    }
}
