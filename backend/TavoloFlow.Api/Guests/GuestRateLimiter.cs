using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Guests;

public sealed class GuestRateLimitOptions
{
    [Range(1, 10000)]
    public int JoinsPerIpPerMinute { get; set; } = 60;

    [Range(1, 10000)]
    public int JoinsPerSessionPerFiveMinutes { get; set; } = 30;
}

// A four-character join code has only about 20 bits of entropy, so attempts are limited per IP and per session.
public sealed class GuestRateLimiter(IOptions<GuestRateLimitOptions> options) : IDisposable
{
    private readonly FixedWindowLimiter ips = new(
        options.Value.JoinsPerIpPerMinute,
        TimeSpan.FromMinutes(1)
    );
    private readonly FixedWindowLimiter sessions = new(
        options.Value.JoinsPerSessionPerFiveMinutes,
        TimeSpan.FromMinutes(5)
    );

    // Returns null when admitted, otherwise the seconds to wait.
    public int? Check(string ip, Guid session) =>
        ips.TryAcquire(ip) ?? sessions.TryAcquire(session.ToString());

    public void Dispose()
    {
        ips.Dispose();
        sessions.Dispose();
    }
}
