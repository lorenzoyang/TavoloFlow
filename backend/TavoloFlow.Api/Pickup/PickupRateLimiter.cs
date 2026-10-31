using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Pickup;

public sealed class PickupRateLimitOptions
{
    [Range(1, 10000)] public int SubmissionsPerIpPerMinute { get; set; } = 10;
}

// Anonymous submissions are limited per IP; staff review, the phone and the pending limit do the rest.
public sealed class PickupRateLimiter(IOptions<PickupRateLimitOptions> options) : IDisposable
{
    private readonly FixedWindowLimiter ips = new(options.Value.SubmissionsPerIpPerMinute, TimeSpan.FromMinutes(1));

    // Returns null when admitted, otherwise the seconds to wait.
    public int? Check(string ip) => ips.TryAcquire(ip);

    public void Dispose() => ips.Dispose();
}
