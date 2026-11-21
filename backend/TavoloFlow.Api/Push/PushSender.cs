using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Push;

// What a device receives, encrypted for it alone. The service worker turns it into "New online order
// #12" in the device's language; it never carries a customer's name, phone or address, because
// notifications pass through Apple's, Google's or Mozilla's servers.
public sealed record PushPayload(int Number, string Language);

// Sends each queued online request to the restaurant's devices, best effort: no retries, and a failed
// device only costs its own notification. A push service answering 404 or 410 means the browser
// dropped the subscription, so the row is deleted.
public sealed class PushSender(
    PushQueue queue,
    IServiceScopeFactory scopes,
    WebPushDelivery delivery,
    TimeProvider clock,
    ILogger<PushSender> logger
) : BackgroundService
{
    public const string HttpClientName = WebPushDelivery.HttpClientName;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var item in queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await SendAsync(item, stoppingToken);
                }
                catch (Exception error) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogWarning(
                        "Push for restaurant {RestaurantId} failed: {Error}.",
                        item.RestaurantId,
                        error.GetType().Name
                    );
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    private async Task SendAsync(OnlineRequestPush item, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        // Once the request has expired, staff can no longer accept it.
        var ttl = (int)(item.ExpiresAt - now).TotalSeconds;
        if (ttl <= 0)
            return;
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await PushTargets.RemoveLapsedAsync(db, item.RestaurantId, now, ct);
        var devices = await db
            .PushSubscriptions.AsNoTracking()
            .Where(s => s.RestaurantId == item.RestaurantId)
            .Select(s => new PushDevice(s.Id, s.Endpoint, s.P256dh, s.Auth, s.Language))
            .ToArrayAsync(ct);
        var gone = await delivery.SendAsync(
            devices,
            d => new PushPayload(item.Number, d.Language),
            ttl,
            ct
        );
        if (gone.Length > 0)
        {
            await db.PushSubscriptions.Where(s => gone.Contains(s.Id)).ExecuteDeleteAsync(ct);
        }
    }
}
