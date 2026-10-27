using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Controllers;

[ApiController]
[AllowAnonymous]
public sealed class PublicMenuController(PublicMenuService menus) : ControllerBase
{
    [HttpGet("api/public/qr/{token}/bootstrap")]
    public async Task<IActionResult> Get(string token, CancellationToken ct) => Ok(await menus.ReadAsync(token, ct));

    // Every upload gets a new id, so a URL never changes content and browsers may keep it for a year.
    // Program.cs marks /api responses no-store first; a successful read replaces that, and Caddy passes it on.
    [HttpGet("api/public/menu-images/{imageId:guid}")]
    public async Task<IActionResult> Image(Guid imageId, CancellationToken ct)
    {
        var content = await menus.ReadImageAsync(imageId, ct);
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(content, "image/webp");
    }
}
