using System.Threading.RateLimiting;

namespace TavoloFlow.Api.Common;

// Fixed-window limits per key (IP address, username, session...). The counters live in this process,
// so a restart or a second instance starts fresh; see the PRD's note before scaling out.
public sealed class FixedWindowLimiter(int permits, TimeSpan window) : IDisposable
{
    // The first string is TSource, which is also used as TPartitionKey here, 
    // meaning the data source is also used as the "partition" key.
    // An IP address is the data source and is also used as the partition key.
    private readonly PartitionedRateLimiter<string> limiter = PartitionedRateLimiter.Create<string, string>(key =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = window,
            QueueLimit = 0,
            AutoReplenishment = true
        }));

    // Returns null when the key is admitted, otherwise the seconds to wait.
    public int? TryAcquire(string key)
    {
        using var lease = limiter.AttemptAcquire(key);
        if (lease.IsAcquired) return null;
        return lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
            ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds))
            : 60;
    }

    public void Dispose() => limiter.Dispose();
}
