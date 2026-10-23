using System.Diagnostics.CodeAnalysis;

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
}
