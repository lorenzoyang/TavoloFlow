using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Online;

public sealed class TurnstileOptions
{
    public const string Section = "Turnstile";
    public bool Enabled { get; set; }
    public string? SiteKey { get; set; }
    public string? SecretKey { get; set; }
    public string? Hostname { get; set; }
    public TurnstilePublicConfiguration? Public => Enabled ? new(SiteKey!.Trim()) : null;

    public static bool IsTestSiteKey(string? value) =>
        value
            is "1x00000000000000000000AA"
                or "2x00000000000000000000AB"
                or "1x00000000000000000000BB"
                or "2x00000000000000000000BB"
                or "3x00000000000000000000FF";

    public static bool IsTestSecretKey(string? value) =>
        value
            is "1x0000000000000000000000000000000AA"
                or "2x0000000000000000000000000000000AA"
                or "3x0000000000000000000000000000000AA";
}

internal sealed class TurnstileOptionsValidator(IHostEnvironment environment)
    : IValidateOptions<TurnstileOptions>
{
    public ValidateOptionsResult Validate(string? name, TurnstileOptions options)
    {
        if (!options.Enabled)
            return ValidateOptionsResult.Success;
        if (!ValidKey(options.SiteKey) || !ValidKey(options.SecretKey))
            return ValidateOptionsResult.Fail(
                "Set Turnstile:SiteKey and Turnstile:SecretKey to complete keys, not example placeholders."
            );
        var testSite = TurnstileOptions.IsTestSiteKey(options.SiteKey!.Trim());
        var testSecret = TurnstileOptions.IsTestSecretKey(options.SecretKey!.Trim());
        if ((testSite || testSecret) && (!environment.IsDevelopment() || !testSite || !testSecret))
            return ValidateOptionsResult.Fail(
                "Turnstile test keys must be paired and may only be used in Development."
            );
        var host = options.Hostname?.Trim();
        if (
            !testSite
            && (string.IsNullOrEmpty(host) || Uri.CheckHostName(host) != UriHostNameType.Dns)
        )
            return ValidateOptionsResult.Fail(
                "Set Turnstile:Hostname to the expected hostname without a scheme, port or path."
            );
        return ValidateOptionsResult.Success;
    }

    private static bool ValidKey(string? key) =>
        !string.IsNullOrWhiteSpace(key)
        && key.Trim().Length is >= 10 and <= 256
        && !key.Trim().Any(char.IsWhiteSpace)
        && !key.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
        && !key.Contains("YOUR_", StringComparison.OrdinalIgnoreCase);
}

public interface IOnlineVerification
{
    Task VerifyAsync(Guid restaurantId, Guid requestId, string? token, CancellationToken ct);
}

// Outside every database lock. cData binds a proof to a single restaurant/request, even during
// Cloudflare's brief token-redemption convergence window. It exposes no recovery credential.
public sealed class OnlineVerification(
    IHttpClientFactory clients,
    IOptions<TurnstileOptions> options,
    ILogger<OnlineVerification> logger
) : IOnlineVerification
{
    public const string HttpClientName = "turnstile";
    public const string Action = "online_order";
    public const string Endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    public static string Binding(Guid restaurantId, Guid requestId) =>
        Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes($"{restaurantId:N}:{requestId:N}"))
        );

    public async Task VerifyAsync(
        Guid restaurantId,
        Guid requestId,
        string? token,
        CancellationToken ct
    )
    {
        var settings = options.Value;
        if (!settings.Enabled)
            return;
        if (string.IsNullOrWhiteSpace(token) || token.Length > 2048)
            throw OnlineErrors.VerificationFailed();
        // Safe diagnostics only: the provider's HTTP status, its documented error codes or the check
        // that failed, so operators can tell a wrong secret or hostname from an outage.
        var detail = "";
        try
        {
            using var body = new FormUrlEncodedContent(
                new Dictionary<string, string>
                {
                    ["secret"] = settings.SecretKey!.Trim(),
                    ["response"] = token,
                }
            );
            using var response = await clients
                .CreateClient(HttpClientName)
                .PostAsync(Endpoint, body, ct);
            if (!response.IsSuccessStatusCode)
            {
                detail = $"HTTP {(int)response.StatusCode}";
                throw OnlineErrors.VerificationUnavailable();
            }
            var result = await response.Content.ReadFromJsonAsync<VerificationResult>(ct);
            if (result is null)
            {
                detail = "empty response";
                throw OnlineErrors.VerificationUnavailable();
            }
            if (!result.Success)
            {
                detail = result.Errors is { Length: > 0 }
                    ? string.Join(",", result.Errors)
                    : "no error codes";
                if (
                    result.Errors is { Length: > 0 }
                    && result.Errors.All(e =>
                        e
                            is "missing-input-response"
                                or "invalid-input-response"
                                or "timeout-or-duplicate"
                    )
                )
                    throw OnlineErrors.VerificationFailed();
                throw OnlineErrors.VerificationUnavailable();
            }
            // Official dummy responses have example.com and omit action/cdata. Startup validation
            // restricts this exception to the recognized paired keys in Development.
            if (!TurnstileOptions.IsTestSiteKey(settings.SiteKey!.Trim()))
            {
                detail =
                    !string.Equals(
                        result.Hostname,
                        settings.Hostname!.Trim(),
                        StringComparison.OrdinalIgnoreCase
                    )
                        ? "hostname mismatch"
                    : result.Action != Action ? "action mismatch"
                    : result.Data != Binding(restaurantId, requestId) ? "cdata mismatch"
                    : "";
                if (detail.Length > 0)
                    throw OnlineErrors.VerificationFailed();
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
            when (error
                    is HttpRequestException
                        or OperationCanceledException
                        or JsonException
                        or NotSupportedException
                        or IOException
            )
        {
            logger.LogWarning(
                "Online verification service unavailable ({ErrorType}).",
                error.GetType().Name
            );
            throw OnlineErrors.VerificationUnavailable();
        }
        catch (ApiException error)
        {
            // Never log keys, raw tokens, request IDs used for recovery, or response bodies.
            logger.LogWarning(
                "Online verification rejected: {Code} ({Detail}).",
                error.Code,
                detail
            );
            throw;
        }
    }

    private sealed record VerificationResult(
        [property: JsonRequired] bool Success,
        string? Hostname,
        string? Action,
        [property: JsonPropertyName("cdata")] string? Data,
        [property: JsonPropertyName("error-codes")] string[]? Errors
    );
}
