using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Dining;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[DiningErrors]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class DiningController(DiningService dining, CurrentAccount current) : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/floor")]
    public async Task<IActionResult> Floor(CancellationToken ct) => Ok(await dining.FloorAsync(RestaurantId, ct));

    [HttpPost("api/staff/tables/{tableId:guid}/open")]
    public async Task<IActionResult> Open(Guid tableId, CancellationToken ct) =>
        StatusCode(201, await dining.OpenAsync(RestaurantId, tableId, ct));

    [HttpGet("api/staff/sessions/{id:guid}")]
    public async Task<IActionResult> Session(Guid id, CancellationToken ct) => Ok(await dining.ReadAsync(RestaurantId, id, ct));

    [HttpGet("api/staff/sessions/{id:guid}/join-code")]
    public async Task<IActionResult> Code(Guid id, CancellationToken ct) => Ok(await dining.ReadCodeAsync(RestaurantId, id, ct));

    [HttpPost("api/staff/sessions/{id:guid}/close-empty")]
    public async Task<IActionResult> Close(Guid id, CloseEmptyInput input, CancellationToken ct) =>
        Ok(await dining.CloseEmptyAsync(RestaurantId, id, input, ct));
}
