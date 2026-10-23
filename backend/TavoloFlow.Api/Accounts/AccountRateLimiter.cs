using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Accounts;

public sealed class AccountRateLimitOptions
{
    [Range(1, 10000)]
    public int LoginPerIpPerMinute { get; set; } = 30;
    [Range(1, 10000)]
    public int LoginPerUsernamePerFiveMinutes { get; set; } = 10;
    [Range(1, 10000)]
    public int PasswordChangesPerMinute { get; set; } = 5;
}

public sealed class AccountRateLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> ipLimiter;
    private readonly PartitionedRateLimiter<string> usernameLimiter;
    private readonly PartitionedRateLimiter<string> passwordLimiter;

    public AccountRateLimiter(IOptions<AccountRateLimitOptions> options)
    {
        ipLimiter = Create(options.Value.LoginPerIpPerMinute, TimeSpan.FromMinutes(1));
        usernameLimiter = Create(options.Value.LoginPerUsernamePerFiveMinutes, TimeSpan.FromMinutes(5));
        passwordLimiter = Create(options.Value.PasswordChangesPerMinute, TimeSpan.FromMinutes(1));
    }

    // The username window is consumed only after the IP window admits the attempt.
    public void EnsureLoginAllowed(string ip, string username) =>
        ThrowIfLimited(Check(ipLimiter, ip) ?? Check(usernameLimiter, username));

    public void EnsurePasswordChangeAllowed(Guid userId) => ThrowIfLimited(Check(passwordLimiter, userId.ToString()));

    private static void ThrowIfLimited(int? waitSeconds)
    {
        if (waitSeconds is { } seconds)
        {
            throw ApiException.RateLimited(seconds, $"操作过于频繁，请在 {seconds} 秒后重试。");
        }
    }

    private static PartitionedRateLimiter<string> Create(int limit, TimeSpan window) =>
        PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetFixedWindowLimiter(
            key, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = limit, Window = window, QueueLimit = 0, AutoReplenishment = true
            }));

    private static int? Check(PartitionedRateLimiter<string> limiter, string key)
    {
        using var lease = limiter.AttemptAcquire(key);
        return lease.IsAcquired ? null :
            lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
                ? Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds)) : 60;
    }

    public void Dispose()
    {
        ipLimiter.Dispose();
        usernameLimiter.Dispose();
        passwordLimiter.Dispose();
    }
}
