using System.Buffers.Text;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;

namespace TavoloFlow.Api.Push;

// The server POSTs to whatever endpoint a browser registered, so only the known browser push
// services are accepted: Chrome and Android (FCM), Safari and iPhone (Apple), Firefox (Mozilla) and
// Edge (Windows). Anything else, plain HTTP, another port or credentials in the URL is refused, and
// the sending client never follows redirects.
public static class PushEndpoints
{
    public const int MaxLength = 2048;
    public const int MaxKeyLength = 128;

    private static readonly string[] Suffixes =
    [
        ".push.apple.com",
        ".push.services.mozilla.com",
        ".notify.windows.com",
    ];

    public static bool IsAllowed([NotNullWhen(true)] string? endpoint)
    {
        if (
            endpoint is null
            || endpoint.Length > MaxLength
            || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || !uri.IsDefaultPort
            || uri.UserInfo.Length > 0
        )
            return false;
        var host = uri.IdnHost.ToLowerInvariant();
        return host == "fcm.googleapis.com"
            || Suffixes.Any(suffix => host.EndsWith(suffix, StringComparison.Ordinal));
    }

    // The browser's P-256 key: base64url of an uncompressed point on the curve.
    public static bool IsDeviceKey([NotNullWhen(true)] string? value)
    {
        var bytes = Decode(value);
        if (bytes is not { Length: 65 } || bytes[0] != 0x04)
            return false;
        try
        {
            using var key = ECDiffieHellman.Create(
                new ECParameters
                {
                    Curve = ECCurve.NamedCurves.nistP256,
                    Q = new ECPoint { X = bytes[1..33], Y = bytes[33..] },
                }
            );
            return true;
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    // The browser's 16-byte authentication secret.
    public static bool IsAuthSecret([NotNullWhen(true)] string? value) =>
        Decode(value) is { Length: 16 };

    private static byte[]? Decode(string? value)
    {
        if (value is null || value.Length > MaxKeyLength || !Base64Url.IsValid(value))
            return null;
        try
        {
            return Base64Url.DecodeFromChars(value);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
