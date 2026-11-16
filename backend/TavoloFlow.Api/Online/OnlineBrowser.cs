using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;

namespace TavoloFlow.Api.Online;

// A marker independent of login identities. Clearing cookies replaces it; IP limits still apply.
public sealed class OnlineBrowser(
    IDataProtectionProvider protection,
    TimeProvider clock,
    IHostEnvironment environment
)
{
    public const string CookieName = "TavoloFlow.OnlineBrowser";
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);
    private readonly IDataProtector protector = protection.CreateProtector("OnlineBrowser.v1");

    public string GetOrCreate(HttpContext context)
    {
        var existing = Read(context);
        if (existing is not null)
            return existing;
        var id = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var expires = clock.GetUtcNow() + Lifetime;
        var payload = $"{expires.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)}:{id}";
        context.Response.Cookies.Append(
            CookieName,
            protector.Protect(payload),
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !environment.IsDevelopment() || context.Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                Path = "/api/public",
                Expires = expires,
            }
        );
        context.Items[CookieName] = id;
        return id;
    }

    public OnlineSubmissionSource Require(HttpContext context) =>
        new(Read(context) ?? throw OnlineErrors.BrowserRequired(), Ip(context));

    private string? Read(HttpContext context)
    {
        if (context.Items[CookieName] is string created)
            return created;
        if (!context.Request.Cookies.TryGetValue(CookieName, out var cookie) || cookie.Length > 512)
            return null;
        try
        {
            var parts = protector.Unprotect(cookie).Split(':');
            if (
                parts.Length == 2
                && long.TryParse(
                    parts[0],
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var expires
                )
                && expires > clock.GetUtcNow().ToUnixTimeSeconds()
                && parts[1].Length == 43
                && WebEncoders.Base64UrlDecode(parts[1]).Length == 32
            )
                return parts[1];
        }
        catch (Exception error) when (error is CryptographicException or FormatException) { }
        return null;
    }

    // ForwardedHeaders has already accepted only the configured proxy's client address.
    public static string Ip(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;
        return address is null
            ? "unknown"
            : (address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address).ToString();
    }
}

// Constructed by the server, never bound from JSON. Digests are restaurant-scoped linkage keys,
// not a claim that an IP address has become anonymous.
public sealed record OnlineSubmissionSource(string BrowserId, string IpAddress)
{
    public static string Key(Guid restaurantId, string value) =>
        Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes($"{restaurantId:D}:{value}"))
        );
}
