using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[AllowAnonymous]
[MenuErrors]
public sealed class PublicMenuController(PublicMenuService menus) : ControllerBase
{
    [HttpGet("api/public/qr/{token}/bootstrap")]
    public async Task<IActionResult> Get(string token, CancellationToken ct) => Ok(await menus.ReadAsync(token, ct));
}
