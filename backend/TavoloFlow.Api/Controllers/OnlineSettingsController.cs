using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Controllers;

// Phone, hours, delivery and coupons belong to OWNER; STAFF and OWNER read the settings and pause or
// resume.
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class OnlineSettingsController(OnlineSettingsService service, CurrentAccount current)
    : ControllerBase
{
    private Guid RestaurantId => current.RequireUser().RestaurantId;

    [HttpGet("api/staff/online/settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) =>
        Ok(await service.ReadAsync(RestaurantId, ct));

    [HttpPut("api/staff/online/pause")]
    public async Task<IActionResult> Pause(OnlinePauseInput input, CancellationToken ct) =>
        Ok(await service.PauseAsync(RestaurantId, input.Until!, ct));

    [HttpDelete("api/staff/online/pause")]
    public async Task<IActionResult> Resume(CancellationToken ct) =>
        Ok(await service.ResumeAsync(RestaurantId, ct));

    [HttpPut("api/owner/online/hours")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> Hours(OnlineHoursInput input, CancellationToken ct) =>
        Ok(await service.SetHoursAsync(RestaurantId, input, ct));

    [HttpPut("api/owner/online/pickup")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> Pickup(OnlinePickupInput input, CancellationToken ct) =>
        Ok(await service.SetPickupAsync(RestaurantId, input, ct));

    [HttpPut("api/owner/online/delivery")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> Delivery(OnlineDeliveryInput input, CancellationToken ct) =>
        Ok(await service.SetDeliveryAsync(RestaurantId, input, ct));

    [HttpPost("api/owner/online/coupons")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> CreateCoupon(OnlineCouponInput input, CancellationToken ct) =>
        Ok(await service.CreateCouponAsync(RestaurantId, input, ct));

    [HttpDelete("api/owner/online/coupons/{id:guid}")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> DeleteCoupon(Guid id, CancellationToken ct) =>
        Ok(await service.DeleteCouponAsync(RestaurantId, id, ct));

    [HttpPatch("api/owner/online/phone")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public async Task<IActionResult> Phone(PublicPhoneInput input, CancellationToken ct) =>
        Ok(await service.SetPhoneAsync(RestaurantId, input.PublicPhone, ct));
}
