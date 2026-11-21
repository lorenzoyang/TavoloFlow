namespace TavoloFlow.Api.Online;

// Pickup slots and kitchen start times use the same restaurant calendar and server clock.
public static class OnlinePickup
{
    public static readonly int[] NoticeChoices = [30, 45, 60, 90, 120];
    public static readonly int[] PreparationChoices = [10, 20, 30, 45];
    private const int Interval = 15;

    public static DateTime[] Times(
        OnlineSlot[] hours,
        TimeZoneInfo zone,
        DateTimeOffset now,
        int noticeMinutes
    )
    {
        var today = OnlineSchedule.Local(zone, now).Date;
        var earliest = now.UtcDateTime.AddMinutes(noticeMinutes);
        var times = new List<DateTime>();
        for (var day = 0; day <= 1; day++)
        {
            var date = today.AddDays(day);
            foreach (var slot in hours.Where(s => s.Weekday == OnlineSchedule.Weekday(date)))
            {
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
            }
        }
        return times.Order().ToArray();
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
