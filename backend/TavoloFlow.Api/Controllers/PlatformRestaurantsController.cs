using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[Route("api/platform/restaurants")]
[Authorize(Policy = PlatformAuthentication.Policy)]
public sealed class PlatformRestaurantsController(RestaurantAdministration service, CurrentPlatformAccount current) : ControllerBase
{
    private Guid Actor => current.RequireUser().Id;
    [HttpGet]
    public async Task<IActionResult> List(string? search, string? status, string? subscriptionStatus, string? sort,
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        Ok(await service.ListAsync(search, status, subscriptionStatus, sort, page, pageSize, ct));
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct) => Ok(await service.ReadAsync(id, ct));
    [HttpPost]
    public async Task<IActionResult> Create(CreateRestaurantInput input, CancellationToken ct) =>
        StatusCode(201, await service.CreateAsync(input, Actor, ct));
    [HttpPatch("{id:guid}/service-status")]
    public async Task<IActionResult> Status(Guid id, ServiceStatusInput input, CancellationToken ct) =>
        Ok(await service.SetStatusAsync(id, input.Status, Actor, ct));
    [HttpPatch("{id:guid}/google-maps-url")]
    public async Task<IActionResult> MapsUrl(Guid id, GoogleMapsUrlInput input, CancellationToken ct) =>
        Ok(await service.SetGoogleMapsUrlAsync(id, input.GoogleMapsUrl, Actor, ct));
    [HttpPatch("{id:guid}/join-code-required")]
    public async Task<IActionResult> JoinCodeRequired(Guid id, JoinCodeRequiredInput input, CancellationToken ct) =>
        Ok(await service.SetJoinCodeRequiredAsync(id, input.JoinCodeRequired!.Value, Actor, ct));
    [HttpPatch("{id:guid}/users/{userId:guid}/active")]
    public async Task<IActionResult> Active(Guid id, Guid userId, AccountActiveInput input, CancellationToken ct) =>
        Ok(await service.SetActiveAsync(id, userId, input.ExpectedCredentialVersion!.Value, input.IsActive!.Value, Actor, ct));
    [HttpPost("{id:guid}/users/{userId:guid}/reset-password")]
    public async Task<IActionResult> Reset(Guid id, Guid userId, ResetAccountInput input, CancellationToken ct) =>
        Ok(await service.ResetAsync(id, userId, input.ExpectedCredentialVersion!.Value, $"platform:{Actor}", ct));
}
