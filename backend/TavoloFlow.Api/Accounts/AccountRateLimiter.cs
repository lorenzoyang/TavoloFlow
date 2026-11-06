using System.ComponentModel.DataAnnotations;
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

// Used by both the store and the platform identity, each with its own instance and limits.
public sealed class AccountRateLimiter(AccountRateLimitOptions options) : IDisposable
{
    private readonly FixedWindowLimiter ips = new(
        options.LoginPerIpPerMinute,
        TimeSpan.FromMinutes(1)
    );
    private readonly FixedWindowLimiter usernames = new(
        options.LoginPerUsernamePerFiveMinutes,
        TimeSpan.FromMinutes(5)
    );
    private readonly FixedWindowLimiter passwordChanges = new(
        options.PasswordChangesPerMinute,
        TimeSpan.FromMinutes(1)
    );

    // The username window is consumed only after the IP window admits the attempt.
    // Therefore, check login attempts first for the IP, then for the username.
    public void EnsureLoginAllowed(string ip, string username) =>
        ThrowIfLimited(ips.TryAcquire(ip) ?? usernames.TryAcquire(username));

    public void EnsurePasswordChangeAllowed(Guid userId) =>
        ThrowIfLimited(passwordChanges.TryAcquire(userId.ToString()));

    private static void ThrowIfLimited(int? waitSeconds)
    {
        if (waitSeconds is { } seconds)
        {
            throw ApiException.RateLimited(
                seconds,
                $"Too many attempts. Try again in {seconds} seconds."
            );
        }
    }

    public void Dispose()
    {
        ips.Dispose();
        usernames.Dispose();
        passwordChanges.Dispose();
    }
}
