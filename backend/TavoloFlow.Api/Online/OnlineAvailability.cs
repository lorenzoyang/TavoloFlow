using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

public static class OnlineStatus
{
    public const string Open = "OPEN";
    public const string Paused = "PAUSED";
    public const string ClosedHours = "CLOSED_HOURS";
    public const string NotOffered = "NOT_OFFERED";
    public const string Suspended = "SUSPENDED";
}

// NextOpensAt only accompanies CLOSED_HOURS.
public sealed record OnlineAvailabilityResult(string Status, DateTime? NextOpensAt)
{
    public bool IsOpen => Status == OnlineStatus.Open;
}

// Whether customers can order online right now. This is the only place that decides it: the settings
// page, the online menu and submission all call it with the time from TimeProvider.
// The cap on waiting requests joins this rule once submissions exist (design step 4).
public static class OnlineAvailability
{
    public static OnlineAvailabilityResult Evaluate(
        Restaurant restaurant,
        IReadOnlyCollection<OnlineSlot> hours,
        DateTimeOffset now
    )
    {
        if (restaurant.ServiceStatus != RestaurantServiceStatus.Active)
            return new(OnlineStatus.Suspended, null);
        if (!restaurant.OnlineEnabled || restaurant.PublicPhone is null)
            return new(OnlineStatus.NotOffered, null);
        if (IsPaused(restaurant, now))
            return new(OnlineStatus.Paused, null);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        var local = OnlineSchedule.Local(zone, now);
        if (OnlineSchedule.Current(hours, local) is null)
            return new(OnlineStatus.ClosedHours, OnlineSchedule.NextOpensAt(hours, local, zone));
        return new(OnlineStatus.Open, null);
    }

    // A pause lapses on its own once its time passes; nothing clears the column.
    public static bool IsPaused(Restaurant restaurant, DateTimeOffset now) =>
        restaurant.OnlinePausedUntil is { } until && until > now.UtcDateTime;
}
