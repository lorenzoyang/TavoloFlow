using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Push;

// The VAPID public key browsers subscribe with; null while the server has push turned off.
public sealed record PushKeyResponse(string? PublicKey);

// This device's browser subscription and the interface language its notifications use. Saving it again
// is harmless: the endpoint identifies the device.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PushSubscriptionInput(
    [Required] string? Endpoint,
    [Required] string? P256dh,
    [Required] string? Auth,
    [Required] string? Language
)
{
    public void Validate()
    {
        var errors = new Dictionary<string, string[]>();
        if (!PushEndpoints.IsAllowed(Endpoint))
            errors["endpoint"] = ["Not a supported browser push service."];
        if (!PushEndpoints.IsDeviceKey(P256dh))
            errors["p256dh"] = ["Not a P-256 public key."];
        if (!PushEndpoints.IsAuthSecret(Auth))
            errors["auth"] = ["Not a 16-byte secret."];
        if (!InputRules.IsLanguage(Language))
            errors["language"] = ["Use zh, it or en."];
        if (errors.Count > 0)
            throw ApiException.Validation("The push subscription is invalid.", errors);
    }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PushEndpointInput([Required] string? Endpoint);

public static class PushErrors
{
    public static ApiException NotConfigured() =>
        new(409, "PUSH_NOT_CONFIGURED", "This server doesn't send lock-screen notifications.");

    public static ApiException DeviceLimit() =>
        new(
            409,
            "PUSH_DEVICE_LIMIT",
            $"At most {PushSubscriptionService.MaxDevicesPerRestaurant} devices per restaurant receive notifications."
        );
}
