using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Controllers;

[ApiController, AllowAnonymous]
[Route("api/health")]
public sealed class HealthController(ApplicationDbContext db, ILogger<HealthController> logger) : ControllerBase
{
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "alive" });

    [HttpGet("ready")]
    public async Task<IActionResult> Ready(CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            if (await db.Database.CanConnectAsync(timeout.Token) &&
                !(await db.Database.GetPendingMigrationsAsync(timeout.Token)).Any())
                return Ok(new { status = "ready" });
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            // Health output and logs must not include connection strings or credential-bearing exceptions.
            logger.LogWarning("Database readiness check failed ({ErrorType}).", error.GetType().Name);
        }
        return StatusCode(503, new { status = "not-ready" });
    }
}
