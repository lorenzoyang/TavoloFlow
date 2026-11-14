namespace TavoloFlow.Api.Online;

// A weekly slot in local minutes of the day; ClosesMinute is exclusive and at most 1440.
public readonly record struct OnlineSlot(int Weekday, int OpensMinute, int ClosesMinute);

// Pure calendar rules for weekly online hours, in the restaurant's time zone. Callers pass the
// current time from TimeProvider, so tests can pin any instant, including DST changes.
public static class OnlineSchedule
{
    public const int MinutesPerDay = 1440;

    // The restaurant's wall-clock time.
    public static DateTime Local(TimeZoneInfo zone, DateTimeOffset now) =>
        TimeZoneInfo.ConvertTime(now, zone).DateTime;

    // ISO weekday: Monday is 1, Sunday is 7.
    public static int Weekday(DateTime local) =>
        local.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)local.DayOfWeek;

    public static int MinuteOfDay(DateTime local) => local.Hour * 60 + local.Minute;

    // The slot that accepts orders now: opens <= now < closes, compared as local wall-clock minutes.
    public static OnlineSlot? Current(IEnumerable<OnlineSlot> slots, DateTime local)
    {
        var weekday = Weekday(local);
        var minute = MinuteOfDay(local);
        foreach (var slot in slots)
            if (slot.Weekday == weekday && slot.OpensMinute <= minute && minute < slot.ClosesMinute)
                return slot;
        return null;
    }

    // When the current slot stops accepting orders; a slot ending at 1440 ends at the next local midnight.
    public static DateTime SlotEndUtc(OnlineSlot slot, DateTime local, TimeZoneInfo zone) =>
        ToUtc(local.Date.AddMinutes(slot.ClosesMinute), zone);

    // The next local midnight.
    public static DateTime EndOfDayUtc(DateTime local, TimeZoneInfo zone) =>
        ToUtc(local.Date.AddDays(1), zone);

    // The next slot start after now within seven days (today's later slots up to the same weekday next
    // week), or null when the week has no slots.
    public static DateTime? NextOpensAt(
        IEnumerable<OnlineSlot> slots,
        DateTime local,
        TimeZoneInfo zone
    )
    {
        var ordered = slots.OrderBy(s => s.OpensMinute).ToArray();
        var minute = MinuteOfDay(local);
        for (var day = 0; day <= 7; day++)
        {
            var date = local.Date.AddDays(day);
            var weekday = Weekday(date);
            foreach (var slot in ordered)
                if (slot.Weekday == weekday && (day > 0 || slot.OpensMinute > minute))
                    return ToUtc(date.AddMinutes(slot.OpensMinute), zone);
        }
        return null;
    }

    // Converts a local wall-clock time to UTC. A time skipped by a forward DST jump moves to the jump
    // itself; a time that occurs twice when clocks go back takes its first occurrence.
    public static DateTime ToUtc(DateTime local, TimeZoneInfo zone)
    {
        var wall = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(wall))
            wall = wall.AddMinutes(1);
        if (zone.IsAmbiguousTime(wall))
            return DateTime.SpecifyKind(
                wall - zone.GetAmbiguousTimeOffsets(wall).Max(),
                DateTimeKind.Utc
            );
        return TimeZoneInfo.ConvertTimeToUtc(wall, zone);
    }
}
