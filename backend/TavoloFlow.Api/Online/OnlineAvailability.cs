using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

public static class OnlineStatus
{
    public const string Open = "OPEN";
    public const string Busy = "BUSY";
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
public static class OnlineAvailability
{
    // Requests waiting for staff beyond which customers cannot submit more.
    public const int MaxWaitingRequests = 20;

    public static OnlineAvailabilityResult Evaluate(
        Restaurant restaurant,
        IReadOnlyCollection<OnlineSlot> hours,
        int waitingRequests,
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
        if (waitingRequests >= MaxWaitingRequests)
            return new(OnlineStatus.Busy, null);
        return new(OnlineStatus.Open, null);
    }

    // A pause lapses on its own once its time passes; nothing clears the column.
    public static bool IsPaused(Restaurant restaurant, DateTimeOffset now) =>
        restaurant.OnlinePausedUntil is { } until && until > now.UtcDateTime;

    // Loads what Evaluate needs, inside the caller's transaction, and evaluates it.
    public static async Task<(OnlineSlot[] Hours, OnlineAvailabilityResult Result)> ReadAsync(
        ApplicationDbContext db,
        Restaurant restaurant,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var hours = await HoursAsync(db, restaurant.Id, ct);
        var waiting = await db
            .OnlineRequests.Waiting(restaurant.Id, now.UtcDateTime)
            .CountAsync(ct);
        return (hours, Evaluate(restaurant, hours, waiting, now));
    }

    public static async Task<OnlineSlot[]> HoursAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        CancellationToken ct
    ) =>
        await db
            .OnlineHours.AsNoTracking()
            .Where(h => h.RestaurantId == restaurantId)
            .OrderBy(h => h.Weekday)
            .ThenBy(h => h.OpensMinute)
            .Select(h => new OnlineSlot(h.Weekday, h.OpensMinute, h.ClosesMinute))
            .ToArrayAsync(ct);
}
