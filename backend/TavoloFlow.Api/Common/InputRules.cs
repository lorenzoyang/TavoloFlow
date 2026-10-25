using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace TavoloFlow.Api.Common;

public static class InputRules
{
    // JavaScript's Number.MAX_SAFE_INTEGER: the browser must represent every amount in cents exactly.
    public const long MaxSafeCents = 9_007_199_254_740_991;

    // Supported menu and guest UI languages.
    public static readonly IReadOnlyList<string> Languages = ["zh", "it", "en"];

    public static bool IsLanguage([NotNullWhen(true)] string? value) => value is "zh" or "it" or "en";

    // Optional text fields store blank input as NULL.
    public static string? TrimToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // A restaurant's map link is rendered as a plain href, so only HTTPS Google Maps share or place URLs pass.
    public static bool IsGoogleMapsUrl(string value) =>
        value.Length <= 2048 && Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && uri.UserInfo.Length == 0 &&
        (uri.Host == "maps.app.goo.gl" || Regex.IsMatch(uri.Host, @"^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$") ||
         Regex.IsMatch(uri.Host, @"^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$") &&
         (uri.AbsolutePath == "/maps" || uri.AbsolutePath.StartsWith("/maps/", StringComparison.Ordinal)));
}
