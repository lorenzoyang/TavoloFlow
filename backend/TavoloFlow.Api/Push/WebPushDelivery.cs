using System.Net;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using WebPushSubscription = Lib.Net.Http.WebPush.PushSubscription;

namespace TavoloFlow.Api.Push;

public sealed record PushDevice(
    Guid Id,
    string Endpoint,
    string P256dh,
    string Auth,
    string Language
);

public sealed class WebPushDelivery(
    PushKeys keys,
    IHttpClientFactory httpClients,
    ILogger<WebPushDelivery> logger
)
{
    public const string HttpClientName = "push";

    public async Task<Guid[]> SendAsync<T>(
        PushDevice[] devices,
        Func<PushDevice, T> payload,
        int ttl,
        CancellationToken ct
    )
    {
        var gone = await Task.WhenAll(
            devices.Select(device => SendAsync(device, payload(device), ttl, ct))
        );
        return gone.OfType<Guid>().ToArray();
    }

    private async Task<Guid?> SendAsync<T>(
        PushDevice device,
        T payload,
        int ttl,
        CancellationToken ct
    )
    {
        try
        {
            var subscription = new WebPushSubscription { Endpoint = device.Endpoint };
            subscription.SetKey(PushEncryptionKeyName.P256DH, device.P256dh);
            subscription.SetKey(PushEncryptionKeyName.Auth, device.Auth);
            var message = new PushMessage(
                JsonSerializer.Serialize(payload, JsonSerializerOptions.Web)
            )
            {
                TimeToLive = ttl,
                Urgency = PushMessageUrgency.High,
            };
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
            await client.RequestPushMessageDeliveryAsync(subscription, message, ct);
        }
        catch (PushServiceClientException error)
            when (error.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return device.Id;
        }
        catch (PushServiceClientException error)
        {
            logger.LogWarning("Push service answered {Status}.", (int)error.StatusCode);
        }
        catch (Exception error) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning("Push delivery failed: {Error}.", error.GetType().Name);
        }
        return null;
    }
}
