using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace TavoloFlow.Api.Common;

public static class InputRules
{
    public const int MaxRestaurantNameLength = 150;

    // JavaScript's Number.MAX_SAFE_INTEGER: the browser must represent every amount in cents exactly.
    public const long MaxSafeCents = 9_007_199_254_740_991;

    // Supported menu and guest UI languages, the only list of them in C#.
    // The database check constraints repeat it, so adding a language also needs a migration.
    public static readonly IReadOnlyList<string> Languages = ["zh", "it", "en"];

    public static bool IsLanguage([NotNullWhen(true)] string? value) =>
        value is not null && Languages.Contains(value);

    public static bool IsRestaurantName(string? name) =>
        !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= MaxRestaurantNameLength;

    // The online ordering link /r/{slug}: 3-40 lowercase letters, digits and hyphens, no hyphen at
    // either end. The ck_restaurant_slug check constraint repeats it; uq_restaurant_slug keeps it unique.
    public const int MaxSlugLength = 40;
    public const string SlugIndex = "uq_restaurant_slug";

    public static bool IsSlug([NotNullWhen(true)] string? value) =>
        value is not null && Regex.IsMatch(value, "^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$");

    // Restaurant and customer phones: an optional + and 6-15 digits once whitespace is removed, stored
    // without it. Returns null when the value does not qualify. ck_restaurant_public_phone repeats it.
    public const int MaxPhoneInputLength = 30;

    public static string? NormalizePhone(string? value)
    {
        if (value is null)
            return null;
        var compact = string.Concat(value.Where(c => !char.IsWhiteSpace(c)));
        return Regex.IsMatch(compact, @"^\+?[0-9]{6,15}$") ? compact : null;
    }

    // Optional text fields store blank input as NULL.
    public static string? TrimToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    // A restaurant's map link is rendered as a plain href, so only HTTPS Google Maps share or place URLs pass.
    public static bool IsGoogleMapsUrl(string value) =>
        value.Length <= 2048
        && Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && uri.IsDefaultPort
        && uri.UserInfo.Length == 0
        && (
            uri.Host == "maps.app.goo.gl"
            || Regex.IsMatch(uri.Host, @"^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$")
            || Regex.IsMatch(uri.Host, @"^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$")
                && (
                    uri.AbsolutePath == "/maps"
                    || uri.AbsolutePath.StartsWith("/maps/", StringComparison.Ordinal)
                )
        );
}
