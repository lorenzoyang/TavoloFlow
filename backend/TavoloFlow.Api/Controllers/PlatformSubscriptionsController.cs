using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/platform/restaurants/{id:guid}/subscription")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformSubscriptionsController(SubscriptionService service, CurrentPlatformAccount current) : ControllerBase
{
    private Guid Actor => current.RequireUser().Id;
    [HttpGet]
    public async Task<IActionResult> Read(Guid id, CancellationToken ct) => Ok(await service.ReadAsync(id, ct));
    [HttpPatch]
    public async Task<IActionResult> Metadata(Guid id, SubscriptionMetadataInput input, CancellationToken ct) =>
        Ok(await service.UpdateMetadataAsync(id, input, Actor, ct));
    [HttpPost("periods")]
    public async Task<IActionResult> CreatePeriod(Guid id, SubscriptionPeriodInput input, CancellationToken ct) =>
        Ok(await service.CreatePeriodAsync(id, input, Actor, ct));
    [HttpPatch("periods/{periodId:guid}")]
    public async Task<IActionResult> EditPeriod(Guid id, Guid periodId, SubscriptionPeriodEditInput input, CancellationToken ct) =>
        Ok(await service.EditPeriodAsync(id, periodId, input, Actor, ct));
    [HttpPatch("periods/{periodId:guid}/expiry")]
    public async Task<IActionResult> Expiry(Guid id, Guid periodId, SubscriptionExpiryInput input, CancellationToken ct) =>
        Ok(await service.ChangeExpiryAsync(id, periodId, input, Actor, ct));
    [HttpPost("periods/{periodId:guid}/payment")]
    public async Task<IActionResult> Payment(Guid id, Guid periodId, SubscriptionPaymentInput input, CancellationToken ct) =>
        Ok(await service.ConfirmPaymentAsync(id, periodId, input, Actor, ct));
}

[ApiController]
[Route("api/platform/subscription-reminders")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformSubscriptionRemindersController(SubscriptionService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read(CancellationToken ct) => Ok(await service.RemindersAsync(ct));
}
