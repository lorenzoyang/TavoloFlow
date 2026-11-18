using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Online;

public sealed class OnlineRateLimitOptions
{
    [Range(1, 10000)]
    public int SubmissionsPerIpPerMinute { get; set; } = 3;

    [Range(1, 10000)]
    public int SubmissionsPerIpPerTenMinutes { get; set; } = 10;

    [Range(1, 20)]
    public int MaxWaitingPerIp { get; set; } = 5;

    [Range(1, 10000)]
    public int MenusPerIpPerMinute { get; set; } = 120;

    [Range(1, 10000)]
    public int StatusChecksPerIpPerMinute { get; set; } = 240;

    [Range(1, 10000)]
    public int RecoveriesPerIpPerMinute { get; set; } = 60;

    [Range(1, 10000)]
    public int ContextChecksPerIpPerMinute { get; set; } = 120;

    [Range(1, 10000)]
    public int CouponChecksPerIpPerTenMinutes { get; set; } = 30;

    // Delivery quotes have their own budget, so asking for a fee never uses up order submissions.
    [Range(1, 10000)]
    public int QuotesPerIpPerTenMinutes { get; set; } = 10;
}

public enum OnlineLimit
{
    Submission,
    Menu,
    Status,
    Recovery,
    Context,
    Coupon,
    Quote,
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class OnlineLimitAttribute(OnlineLimit policy) : Attribute
{
    public OnlineLimit Policy { get; } = policy;
}

// Independent per-IP budgets. All submission attempts count, including malformed JSON,
// CSRF failures and repeats. These process-local counters do not count queue slots.
public sealed class OnlineRateLimiter : IDisposable
{
    private readonly Dictionary<OnlineLimit, FixedWindowLimiter[]> limits;

    public OnlineRateLimiter(IOptions<OnlineRateLimitOptions> options)
    {
        var value = options.Value;
        var minute = TimeSpan.FromMinutes(1);
        var tenMinutes = TimeSpan.FromMinutes(10);
        limits = new()
        {
            [OnlineLimit.Submission] =
            [
                new(value.SubmissionsPerIpPerMinute, minute),
                new(value.SubmissionsPerIpPerTenMinutes, tenMinutes),
            ],
            [OnlineLimit.Menu] = [new(value.MenusPerIpPerMinute, minute)],
            [OnlineLimit.Status] = [new(value.StatusChecksPerIpPerMinute, minute)],
            [OnlineLimit.Recovery] = [new(value.RecoveriesPerIpPerMinute, minute)],
            [OnlineLimit.Context] = [new(value.ContextChecksPerIpPerMinute, minute)],
            [OnlineLimit.Coupon] = [new(value.CouponChecksPerIpPerTenMinutes, tenMinutes)],
            [OnlineLimit.Quote] = [new(value.QuotesPerIpPerTenMinutes, tenMinutes)],
        };
    }

    public int? Check(OnlineLimit policy, string ip)
    {
        int? wait = null;
        foreach (var limiter in limits[policy])
            if (limiter.TryAcquire(ip) is { } seconds)
                wait = Math.Max(wait ?? 0, seconds);
        return wait;
    }

    public void Dispose()
    {
        foreach (var limiter in limits.Values.SelectMany(value => value))
            limiter.Dispose();
    }
}

// Runs after routing and before authentication, CSRF and model binding. QR ordering and staff
// requests retain their own rules; only explicitly marked online endpoints participate.
public sealed class OnlineRateLimitMiddleware(
    RequestDelegate next,
    ILogger<OnlineRateLimitMiddleware> logger
)
{
    public async Task InvokeAsync(HttpContext context, OnlineRateLimiter limiter)
    {
        var policy = context.GetEndpoint()?.Metadata.GetMetadata<OnlineLimitAttribute>();
        if (
            policy is not null
            && limiter.Check(policy.Policy, OnlineBrowser.Ip(context)) is { } wait
        )
        {
            logger.LogWarning(
                "Online rate limit reached. Request {RequestId}.",
                context.TraceIdentifier
            );
            context.Response.Headers.RetryAfter = wait.ToString(CultureInfo.InvariantCulture);
            await ApiError.WriteAsync(
                context,
                429,
                "RATE_LIMITED",
                "Too many requests. Try again shortly."
            );
            return;
        }
        await next(context);
    }
}
