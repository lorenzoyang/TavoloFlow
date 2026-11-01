using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Pickup;

// Whether the online menu takes pickup requests right now, in the order the submission checks them.
public enum PickupStatus
{
    Open,
    Paused,
    ClosedHours,
    NotOffered,
    Suspended
}

public sealed record PickupAvailability(PickupStatus Status, DateTime? NextOpensAt);

// Weekly hours in the restaurant's local time. Callers pass the current time from the injected TimeProvider.
public static class PickupHours
{
    public static int Weekday(DateTime local) => local.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)local.DayOfWeek;

    // Requests are taken while opens ≤ local now < closes on the local weekday.
    public static bool IsOpen(IEnumerable<PickupHour> hours, TimeZoneInfo zone, DateTimeOffset now)
    {
        var local = TimeZoneInfo.ConvertTime(now, zone).DateTime;
        var minute = local.Hour * 60 + local.Minute;
        var day = Weekday(local);
        return hours.Any(h => h.Weekday == day && h.OpensMinute <= minute && minute < h.ClosesMinute);
    }

    // The next real opening within seven local dates. Normal days need only the configured starts.
    // On a clock-change day, walk UTC minute boundaries (the precision of the weekly hours): this also
    // handles an entirely skipped window and reopening when the clock moves back inside an earlier window.
    public static DateTime? NextOpening(IReadOnlyCollection<PickupHour> hours, TimeZoneInfo zone, DateTimeOffset now)
    {
        var today = TimeZoneInfo.ConvertTime(now, zone).Date;
        for (var days = 0; days <= 7; days++)
        {
            var date = today.AddDays(days);
            var dayHours = hours.Where(h => h.Weekday == Weekday(date)).OrderBy(h => h.OpensMinute).ToArray();
            if (dayHours.Length == 0) continue;
            var start = UtcDayStart(date, zone);
            var end = UtcDayStart(date.AddDays(1), zone);
            if (end - start != TimeSpan.FromDays(1))
            {
                for (var at = start; at < end; at = at.AddMinutes(1))
                    if (at > now.UtcDateTime && IsOpen(hours, zone, at) && !IsOpen(hours, zone, at.AddTicks(-1)))
                        return at;
                continue;
            }
            foreach (var hour in dayHours)
            {
                var utc = TimeZoneInfo.ConvertTimeToUtc(date.AddMinutes(hour.OpensMinute), zone);
                if (utc > now.UtcDateTime) return utc;
            }
        }
        return null;
    }

    private static DateTime UtcDayStart(DateTime date, TimeZoneInfo zone)
    {
        while (zone.IsInvalidTime(date)) date = date.AddMinutes(1);
        var offset = zone.IsAmbiguousTime(date) ? zone.GetAmbiguousTimeOffsets(date).Max() : zone.GetUtcOffset(date);
        return DateTime.SpecifyKind(date - offset, DateTimeKind.Utc);
    }

    // The single answer to "can a guest submit now", shared by the online menu, the settings page and submission.
    public static PickupAvailability Availability(Restaurant restaurant, IReadOnlyCollection<PickupHour> hours, DateTimeOffset now)
    {
        if (restaurant.ServiceStatus != RestaurantServiceStatus.Active) return new(PickupStatus.Suspended, null);
        if (!restaurant.PickupEnabled) return new(PickupStatus.NotOffered, null);
        if (restaurant.PickupPaused) return new(PickupStatus.Paused, null);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        return IsOpen(hours, zone, now)
            ? new(PickupStatus.Open, null)
            : new(PickupStatus.ClosedHours, NextOpening(hours, zone, now));
    }

    // A whole week: at most two windows per day, each inside one day, the second starting no earlier than
    // the first ends (they may touch) and only next to a first.
    public static PickupHour[] Validate(Guid restaurantId, PickupHourInput?[]? input)
    {
        if (input is null || input.Length > 14 || input.Any(x => x is null))
            throw ApiException.Validation("请提交整周的营业时间，每天最多两段。");
        var hours = input.Select(x => x!).ToArray();
        if (hours.Any(h => h.Weekday is < 1 or > 7 || h.Slot is < 1 or > 2 || h.OpensMinute < 0 ||
                h.OpensMinute >= h.ClosesMinute || h.ClosesMinute > 1440) ||
            hours.DistinctBy(h => (h.Weekday, h.Slot)).Count() != hours.Length)
            throw ApiException.Validation("每段营业时间须在同一天内，开始早于结束，最晚到 24:00。");
        foreach (var second in hours.Where(h => h.Slot == 2))
        {
            var first = hours.SingleOrDefault(h => h.Weekday == second.Weekday && h.Slot == 1);
            if (first is null || second.OpensMinute < first.ClosesMinute)
                throw ApiException.Validation("第二段须在第一段结束之后开始。");
        }
        return hours.Select(h => new PickupHour { RestaurantId = restaurantId, Weekday = h.Weekday, Slot = h.Slot,
            OpensMinute = h.OpensMinute, ClosesMinute = h.ClosesMinute }).ToArray();
    }
}
