using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Billing;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class BillingController(BillingService billing, CurrentAccount current)
    : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/sessions/{id:guid}/bill")]
    public async Task<IActionResult> Bill(
        Guid id,
        CancellationToken ct,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) => Ok(await billing.ReadAsync(RestaurantId, id, false, cursor, limit, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpPost("api/owner/sessions/{id:guid}/checkout")]
    public async Task<IActionResult> Checkout(Guid id, CheckoutInput input, CancellationToken ct) =>
        Ok(await billing.CheckoutAsync(RestaurantId, id, input, ct));

    [HttpPost("api/staff/sessions/{id:guid}/close-empty")]
    public async Task<IActionResult> CloseEmpty(
        Guid id,
        CloseZeroBillInput input,
        CancellationToken ct
    ) => Ok(await billing.CloseEmptyAsync(RestaurantId, id, input, ct));

    [HttpPost("api/staff/sessions/{id:guid}/close-void")]
    public async Task<IActionResult> CloseVoid(
        Guid id,
        CloseZeroBillInput input,
        CancellationToken ct
    ) => Ok(await billing.CloseVoidAsync(RestaurantId, id, input, ct));

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpGet("api/owner/history")]
    public async Task<IActionResult> History(
        CancellationToken ct,
        [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null,
        [FromQuery] string? tableLabel = null,
        [FromQuery] string? closeReason = null,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) =>
        Ok(
            await billing.HistoryAsync(
                RestaurantId,
                fromDate,
                toDate,
                tableLabel,
                closeReason,
                cursor,
                limit,
                ct
            )
        );

    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    [HttpGet("api/owner/history/{id:guid}")]
    public async Task<IActionResult> HistoryBill(
        Guid id,
        CancellationToken ct,
        [FromQuery] string? cursor = null,
        [FromQuery] int limit = 50
    ) => Ok(await billing.ReadAsync(RestaurantId, id, true, cursor, limit, ct));
}
