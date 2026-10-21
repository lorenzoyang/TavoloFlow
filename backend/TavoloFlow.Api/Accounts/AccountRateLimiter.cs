using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;

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

    public int? CheckLogin(string ip, string username)
    {
        var ipWait = Check(ipLimiter, ip);
        if (ipWait is not null)
        {
            return ipWait;
        }
        return Check(usernameLimiter, username);
    }

    public int? CheckPasswordChange(Guid userId) => Check(passwordLimiter, userId.ToString());

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
