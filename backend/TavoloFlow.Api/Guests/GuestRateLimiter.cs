using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;

namespace TavoloFlow.Api.Guests;

public sealed class GuestRateLimitOptions
{
    [Range(1, 10000)] public int JoinsPerIpPerMinute { get; set; } = 60;
    [Range(1, 10000)] public int JoinsPerSessionPerFiveMinutes { get; set; } = 30;
}

public sealed class GuestRateLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> ips;
    private readonly PartitionedRateLimiter<string> sessions;

    public GuestRateLimiter(IOptions<GuestRateLimitOptions> options)
    {
        ips = Create(options.Value.JoinsPerIpPerMinute, TimeSpan.FromMinutes(1));
        sessions = Create(options.Value.JoinsPerSessionPerFiveMinutes, TimeSpan.FromMinutes(5));
    }

    public int? Check(string ip, Guid session)
    {
        var wait = Acquire(ips, ip);
        return wait ?? Acquire(sessions, session.ToString());
    }

    private static PartitionedRateLimiter<string> Create(int limit, TimeSpan window) =>
        PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetFixedWindowLimiter(key, _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = window, QueueLimit = 0, AutoReplenishment = true }));

    private static int? Acquire(PartitionedRateLimiter<string> limiter, string key)
    {
        using var lease = limiter.AttemptAcquire(key);
        return lease.IsAcquired ? null : lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
            ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds)) : 60;
    }

    public void Dispose() { ips.Dispose(); sessions.Dispose(); }
}
