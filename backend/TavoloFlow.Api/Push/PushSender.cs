using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using WebPushSubscription = Lib.Net.Http.WebPush.PushSubscription;

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
    PushKeys keys,
    IServiceScopeFactory scopes,
    IHttpClientFactory httpClients,
    TimeProvider clock,
    ILogger<PushSender> logger
) : BackgroundService
{
    public const string HttpClientName = "push";

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
            .Select(s => new
            {
                s.Id,
                s.Endpoint,
                s.P256dh,
                s.Auth,
                s.Language,
            })
            .ToListAsync(ct);
        var gone = new ConcurrentBag<Guid>();
        await Task.WhenAll(
            devices.Select(async device =>
            {
                var subscription = new WebPushSubscription { Endpoint = device.Endpoint };
                subscription.SetKey(PushEncryptionKeyName.P256DH, device.P256dh);
                subscription.SetKey(PushEncryptionKeyName.Auth, device.Auth);
                var message = new PushMessage(
                    JsonSerializer.Serialize(
                        new PushPayload(item.Number, device.Language),
                        JsonSerializerOptions.Web
                    )
                )
                {
                    TimeToLive = ttl,
                    Urgency = PushMessageUrgency.High,
                };
                // One signer per request: the signing key is not shared between threads.
                using var vapid = new VapidAuthentication(keys.PublicKey!, keys.PrivateKey!)
                {
                    Subject = keys.Subject,
                };
                var client = new PushServiceClient(httpClients.CreateClient(HttpClientName))
                {
                    DefaultAuthentication = vapid,
                    DefaultAuthenticationScheme = VapidAuthenticationScheme.Vapid,
                    AutoRetryAfter = false,
                };
                try
                {
                    await client.RequestPushMessageDeliveryAsync(subscription, message, ct);
                }
                catch (PushServiceClientException error)
                    when (error.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                {
                    gone.Add(device.Id);
                }
                // Endpoints are capability URLs: log the status only.
                catch (PushServiceClientException error)
                {
                    logger.LogWarning(
                        "Push service answered {Status} for restaurant {RestaurantId}.",
                        (int)error.StatusCode,
                        item.RestaurantId
                    );
                }
                catch (Exception error) when (!ct.IsCancellationRequested)
                {
                    logger.LogWarning(
                        "Push for restaurant {RestaurantId} failed: {Error}.",
                        item.RestaurantId,
                        error.GetType().Name
                    );
                }
            })
        );
        if (!gone.IsEmpty)
        {
            var ids = gone.ToArray();
            await db.PushSubscriptions.Where(s => ids.Contains(s.Id)).ExecuteDeleteAsync(ct);
        }
    }
}
