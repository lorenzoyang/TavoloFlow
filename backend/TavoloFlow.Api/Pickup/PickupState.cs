using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Pickup;

public enum PickupRequestState
{
    Pending,
    Expired,
    Rejected,
    Accepted
}

// The one rule for a request's state; nothing is written when a request expires, so every reader of
// "pending" must come through here with the current time from the injected TimeProvider (never SQL now()).
// Forgetting the time condition would let expired requests block new submissions or a service switch.
public static class PickupState
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    // At most this many requests of a restaurant wait at once; expired ones do not count.
    public const int PendingLimit = 20;
    // Expired, rejected and closed requests stay readable on the guest's status page this long.
    public static readonly TimeSpan StatusRetention = TimeSpan.FromHours(24);

    // Reads only the last ten minutes of (restaurant_id, expires_at).
    public static IQueryable<PickupRequest> Pending(IQueryable<PickupRequest> requests, DateTime now) =>
        requests.Where(r => r.AcceptedAt == null && r.RejectedAt == null && r.ExpiresAt > now);

    public static PickupRequestState Of(PickupRequest request, DateTime now) =>
        request.AcceptedAt is not null ? PickupRequestState.Accepted
        : request.RejectedAt is not null ? PickupRequestState.Rejected
        : now < request.ExpiresAt ? PickupRequestState.Pending
        : PickupRequestState.Expired;
}
