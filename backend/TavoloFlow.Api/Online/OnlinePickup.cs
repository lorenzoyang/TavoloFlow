namespace TavoloFlow.Api.Online;

public sealed record OnlinePickupDay(DateOnly Date, DateTime[][] Periods);

public sealed record OnlinePickupCalendar(DateOnly Today, OnlinePickupDay[] Days)
{
    public IEnumerable<DateTime> Times() =>
        Days.SelectMany(day => day.Periods).SelectMany(period => period);
}

// Pickup slots and kitchen start times use the same restaurant calendar and server clock.
public static class OnlinePickup
{
    public static readonly int[] NoticeChoices = [30, 45, 60, 90, 120];
    public static readonly int[] PreparationChoices = [10, 20, 30, 45];
    private const int Interval = 15;

    public static OnlinePickupCalendar Calendar(
        OnlineSlot[] hours,
        TimeZoneInfo zone,
        DateTimeOffset now,
        int noticeMinutes,
        int maxDaysAhead
    )
    {
        var today = OnlineSchedule.Local(zone, now).Date;
        var earliest = now.UtcDateTime.AddMinutes(noticeMinutes);
        var days = new List<OnlinePickupDay>();
        var orderedHours = hours.OrderBy(slot => slot.OpensMinute).ToArray();
        for (var day = 0; day <= maxDaysAhead; day++)
        {
            var date = today.AddDays(day);
            var weekday = OnlineSchedule.Weekday(date);
            var periods = new List<DateTime[]>();
            foreach (var slot in orderedHours.Where(slot => slot.Weekday == weekday))
            {
                var times = new List<DateTime>();
                var first = ((slot.OpensMinute + Interval - 1) / Interval) * Interval;
                for (var minute = first; minute < slot.ClosesMinute; minute += Interval)
                {
                    var wall = date.AddMinutes(minute);
                    if (zone.IsInvalidTime(wall))
                        continue;
                    var pickup = OnlineSchedule.ToUtc(wall, zone);
                    if (
                        pickup >= earliest
                        && PreparationStart(
                            hours,
                            zone,
                            pickup,
                            PreparationChoices[0],
                            now.UtcDateTime
                        )
                            is not null
                    )
                        times.Add(pickup);
                }
                if (times.Count > 0)
                    periods.Add(times.ToArray());
            }
            if (periods.Count > 0)
                days.Add(new(DateOnly.FromDateTime(date), periods.ToArray()));
        }
        return new(DateOnly.FromDateTime(today), days.ToArray());
    }

    public static DateTime? PreparationStart(
        OnlineSlot[] hours,
        TimeZoneInfo zone,
        DateTime pickup,
        int minutes,
        DateTime now
    )
    {
        var starts = pickup.AddMinutes(-minutes);
        if (starts < now)
            return null;
        var pickupLocal = OnlineSchedule.Local(zone, pickup);
        var startLocal = OnlineSchedule.Local(zone, starts);
        return
            startLocal.Date == pickupLocal.Date
            && OnlineSchedule.Current(hours, pickupLocal) is { } slot
            && OnlineSchedule.Current(hours, startLocal) == slot
            && starts >= OnlineSchedule.ToUtc(pickupLocal.Date.AddMinutes(slot.OpensMinute), zone)
            ? starts
            : null;
    }
}
