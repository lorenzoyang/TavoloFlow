using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace TavoloFlow.Api.Push;

// Lock-screen push for new online orders. Both values empty turns push off (development, tests, the
// demo); production requires both. PrivateKey is the VAPID P-256 private key as 64 hex characters
// (openssl rand -hex 32); the public key browsers subscribe with is derived from it. Subject is the
// https: or mailto: contact push services may use, https://{DOMAIN} in production.
public sealed class PushOptions
{
    public const string Section = "WebPush";

    public string? PrivateKey { get; set; }
    public string? Subject { get; set; }
}

internal sealed class PushOptionsValidator : IValidateOptions<PushOptions>
{
    public ValidateOptionsResult Validate(string? name, PushOptions options) =>
        PushKeys.Problem(options) is { } problem
            ? ValidateOptionsResult.Fail(problem)
            : ValidateOptionsResult.Success;
}

// The VAPID key pair in the base64url form browsers and the push library use. PublicKey is null
// while push is off.
public sealed class PushKeys
{
    public PushKeys(IOptions<PushOptions> options)
    {
        var value = options.Value;
        if (Problem(value) is { } problem)
            throw new OptionsValidationException(
                PushOptions.Section,
                typeof(PushOptions),
                [problem]
            );
        if (string.IsNullOrWhiteSpace(value.PrivateKey))
            return;
        var privateKey = Convert.FromHexString(value.PrivateKey.Trim());
        PrivateKey = Base64Url.EncodeToString(privateKey);
        PublicKey = Base64Url.EncodeToString(DerivePublicKey(privateKey)!);
        Subject = value.Subject!.Trim();
    }

    public bool Enabled => PublicKey is not null;
    public string? PublicKey { get; }
    public string? PrivateKey { get; }
    public string? Subject { get; }

    internal static string? Problem(PushOptions options)
    {
        var key = options.PrivateKey?.Trim();
        var subject = options.Subject?.Trim();
        if (string.IsNullOrEmpty(key) && string.IsNullOrEmpty(subject))
            return null;
        if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(subject))
            return "Set both WebPush:PrivateKey and WebPush:Subject, or neither to turn push off.";
        if (!Regex.IsMatch(key, "^[0-9a-fA-F]{64}$"))
            return "WebPush:PrivateKey must be 64 hex characters (openssl rand -hex 32).";
        if (DerivePublicKey(Convert.FromHexString(key)) is null)
            return "WebPush:PrivateKey is not a valid P-256 private key; generate another one.";
        if (!IsSubject(subject))
            return "WebPush:Subject must be an https: URL or a mailto: address.";
        return null;
    }

    // The uncompressed P-256 point, or null when the scalar is zero or not below the curve order.
    private static byte[]? DerivePublicKey(byte[] privateKey)
    {
        try
        {
            using var key = ECDsa.Create(
                new ECParameters { Curve = ECCurve.NamedCurves.nistP256, D = privateKey }
            );
            var point = key.ExportParameters(false).Q;
            return [0x04, .. point.X!, .. point.Y!];
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private static bool IsSubject(string subject) =>
        subject.StartsWith("mailto:", StringComparison.Ordinal)
            ? subject.Length > "mailto:".Length && subject.Contains('@')
            : Uri.TryCreate(subject, UriKind.Absolute, out var uri)
                && uri.Scheme == Uri.UriSchemeHttps;
}
