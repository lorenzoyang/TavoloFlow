using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Online;

public sealed class OnlineRateLimitOptions
{
    [Range(1, 10000)]
    public int SubmissionsPerIpPerTenMinutes { get; set; } = 10;

    // Coupon checks at checkout: enough for typos, too few to guess codes.
    [Range(1, 10000)]
    public int CouponChecksPerIpPerTenMinutes { get; set; } = 30;
}

// Anonymous submissions and coupon checks are limited per IP address; every staff acceptance is the real
// screening.
public sealed class OnlineRateLimiter(IOptions<OnlineRateLimitOptions> options) : IDisposable
{
    private readonly FixedWindowLimiter submissions = new(
        options.Value.SubmissionsPerIpPerTenMinutes,
        TimeSpan.FromMinutes(10)
    );

    private readonly FixedWindowLimiter coupons = new(
        options.Value.CouponChecksPerIpPerTenMinutes,
        TimeSpan.FromMinutes(10)
    );

    // Returns null when admitted, otherwise the seconds to wait.
    public int? Check(string ip) => submissions.TryAcquire(ip);

    public int? CheckCoupon(string ip) => coupons.TryAcquire(ip);

    public void Dispose()
    {
        submissions.Dispose();
        coupons.Dispose();
    }
}
