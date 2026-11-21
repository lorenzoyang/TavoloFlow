using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Push;

public sealed class PlatformPushDevices(
    ApplicationDbContext db,
    PushKeys keys,
    WebPushDelivery delivery,
    TimeProvider clock
)
{
    public PushKeyResponse Key() => new(keys.PublicKey);

    public async Task SaveAsync(
        PlatformUser user,
        DateTime ticketExpiry,
        PushSubscriptionInput input,
        CancellationToken ct
    )
    {
        input.Validate();
        if (!keys.Enabled)
            throw PushErrors.NotConfigured();
        await RemoveLapsedAsync(ct);
        var count = await db.PlatformPushSubscriptions.CountAsync(
            s => s.PlatformUserId == user.Id && s.Endpoint != input.Endpoint,
            ct
        );
        if (count >= PushSubscriptionService.MaxDevicesPerRestaurant)
            throw new ApiException(
                409,
                "PLATFORM_PUSH_DEVICE_LIMIT",
                "At most 20 devices per platform account receive notifications."
            );

        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO platform_push_subscriptions
            (id, platform_user_id, endpoint, p256dh, auth, language, credential_version, expires_at)
            VALUES ({Guid.NewGuid()}, {user.Id}, {input.Endpoint}, {input.P256dh}, {input.Auth},
                    {input.Language}, {user.CredentialVersion}, {ticketExpiry})
            ON CONFLICT (endpoint) DO UPDATE SET
                id = EXCLUDED.id,
                platform_user_id = EXCLUDED.platform_user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                language = EXCLUDED.language,
                credential_version = EXCLUDED.credential_version,
                expires_at = EXCLUDED.expires_at
            """,
            ct
        );
    }

    public Task RemoveAsync(Guid userId, string? endpoint, CancellationToken ct)
    {
        if (endpoint is null || endpoint.Length > PushEndpoints.MaxLength)
            throw ApiException.Validation("The push endpoint is invalid.", "endpoint", "Too long.");
        return db
            .PlatformPushSubscriptions.Where(s =>
                s.PlatformUserId == userId && s.Endpoint == endpoint
            )
            .ExecuteDeleteAsync(ct);
    }

    private Task RemoveLapsedAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return db
            .PlatformPushSubscriptions.Where(s =>
                !s.User.IsActive
                || s.User.CredentialVersion != s.CredentialVersion
                || s.ExpiresAt <= now
            )
            .ExecuteDeleteAsync(ct);
    }

    public async Task SendReminderAsync(int count, CancellationToken ct)
    {
        if (!keys.Enabled || count == 0)
            return;
        await RemoveLapsedAsync(ct);
        var devices = await db
            .PlatformPushSubscriptions.AsNoTracking()
            .Select(s => new PushDevice(s.Id, s.Endpoint, s.P256dh, s.Auth, s.Language))
            .ToArrayAsync(ct);
        var gone = await delivery.SendAsync(
            devices,
            d => new { Count = count, d.Language },
            3600,
            ct
        );
        if (gone.Length > 0)
            await db
                .PlatformPushSubscriptions.Where(s => gone.Contains(s.Id))
                .ExecuteDeleteAsync(ct);
    }
}
