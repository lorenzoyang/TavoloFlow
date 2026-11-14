using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;

namespace TavoloFlow.Api.Push;

// The only rule for which devices may still receive notifications. A device stops once its account
// is deactivated, must change its password or has a new credential version (own password change,
// OWNER or platform reset, deactivation), or once the sign-in that registered it expires. Sending and
// registering delete those rows first, so no credential write needs to know about push.
public static class PushTargets
{
    public static Task<int> RemoveLapsedAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        DateTime now,
        CancellationToken ct
    ) =>
        db
            .PushSubscriptions.Where(s =>
                s.RestaurantId == restaurantId
                && (
                    !s.User.IsActive
                    || s.User.MustChangePassword
                    || s.User.CredentialVersion != s.CredentialVersion
                    || s.ExpiresAt <= now
                )
            )
            .ExecuteDeleteAsync(ct);
}
