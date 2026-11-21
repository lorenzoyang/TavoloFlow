using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Push;

// Registers and removes the staff devices that get lock-screen notifications. Both writes are
// idempotent, so the browser keeps no pending marker for them.
public sealed class PushSubscriptionService(
    ApplicationDbContext db,
    PushKeys keys,
    TimeProvider clock
)
{
    // A soft cap: concurrent registrations may pass it together.
    public const int MaxDevicesPerRestaurant = 20;

    public PushKeyResponse Key() => new(keys.PublicKey);

    // Binds the device to the signed-in account, its current credential version and this sign-in's
    // expiry. A device already registered by another account (or restaurant) moves here.
    public async Task SaveAsync(
        RestaurantUser user,
        DateTime ticketExpiresAt,
        PushSubscriptionInput input,
        CancellationToken ct
    )
    {
        input.Validate();
        if (!keys.Enabled)
            throw PushErrors.NotConfigured();
        if (!user.Restaurant.OnlineEnabled)
            throw OnlineErrors.NotOffered();

        var now = clock.GetUtcNow().UtcDateTime;
        await PushTargets.RemoveLapsedAsync(db, user.RestaurantId, now, ct);
        var endpoint = input.Endpoint!;
        var others = await db.PushSubscriptions.CountAsync(
            s => s.RestaurantId == user.RestaurantId && s.Endpoint != endpoint,
            ct
        );
        if (others >= MaxDevicesPerRestaurant)
            throw PushErrors.DeviceLimit();

        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO push_subscriptions (id, restaurant_id, user_id, endpoint, p256dh, auth,
                credential_version, language, expires_at, created_at, updated_at)
            VALUES ({Guid.NewGuid()}, {user.RestaurantId}, {user.Id}, {endpoint}, {input.P256dh},
                {input.Auth}, {user.CredentialVersion}, {input.Language}, {ticketExpiresAt}, {now}, {now})
            ON CONFLICT (endpoint) DO UPDATE SET
                restaurant_id = EXCLUDED.restaurant_id,
                user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                credential_version = EXCLUDED.credential_version,
                language = EXCLUDED.language,
                expires_at = EXCLUDED.expires_at,
                updated_at = EXCLUDED.updated_at
            """,
            ct
        );
    }

    // Only this restaurant's row: removing a device that is not registered does nothing.
    public async Task RemoveAsync(Guid restaurantId, string? endpoint, CancellationToken ct)
    {
        if (endpoint is null || endpoint.Length > PushEndpoints.MaxLength)
            throw ApiException.Validation("The push endpoint is invalid.", "endpoint", "Too long.");
        await db
            .PushSubscriptions.Where(s => s.RestaurantId == restaurantId && s.Endpoint == endpoint)
            .ExecuteDeleteAsync(ct);
    }
}
