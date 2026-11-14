using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

public enum OnlineRequestPhase
{
    Waiting,
    Expired,
    Rejected,
    Accepted,
}

// The only rule for where a request stands; requests have no status column. A request is waiting until
// someone accepts or rejects it, and expires at ExpiresAt exactly. Now always comes from TimeProvider and
// is passed in as a parameter, never SQL now(). Waiting and Phase must stay the same rule.
public static class OnlineRequestState
{
    // Restaurant-scoped and limited to a time range of ix_online_requests_waiting, so it never scans history.
    public static IQueryable<OnlineRequest> Waiting(
        this IQueryable<OnlineRequest> requests,
        Guid restaurantId,
        DateTime now
    ) =>
        requests.Where(r =>
            r.RestaurantId == restaurantId
            && r.AcceptedAt == null
            && r.RejectedAt == null
            && r.ExpiresAt > now
        );

    public static OnlineRequestPhase Phase(OnlineRequest request, DateTime now) =>
        request.AcceptedAt is not null ? OnlineRequestPhase.Accepted
        : request.RejectedAt is not null ? OnlineRequestPhase.Rejected
        : request.ExpiresAt > now ? OnlineRequestPhase.Waiting
        : OnlineRequestPhase.Expired;
}
