using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Pickup;

namespace TavoloFlow.Api.Tests;

// Pure rules: no database. Europe/Rome is UTC+1 in winter and UTC+2 in summer.
public sealed class PickupHoursTests
{
    private static readonly TimeZoneInfo Rome = TimeZoneInfo.FindSystemTimeZoneById("Europe/Rome");
    private static PickupHour Hour(int weekday, int opens, int closes, int slot = 1) =>
        new() { Weekday = weekday, Slot = slot, OpensMinute = opens, ClosesMinute = closes };
    private static DateTimeOffset Utc(string value) => DateTimeOffset.Parse(value + "Z");

    [Theory]
    [InlineData("2026-11-02T09:59:59", false)] // Monday 10:59:59 local
    [InlineData("2026-11-02T10:00:00", true)]  // 11:00 opens
    [InlineData("2026-11-02T13:29:59", true)]  // 14:29:59
    [InlineData("2026-11-02T13:30:00", false)] // 14:30 is the last moment, exclusive
    [InlineData("2026-11-03T10:30:00", false)] // Tuesday has no hours
    public void IsOpen_LocalWindow_IncludesOpeningExcludesClosing(string utc, bool open) =>
        Assert.Equal(open, PickupHours.IsOpen([Hour(1, 660, 870)], Rome, Utc(utc)));

    [Fact]
    public void IsOpen_WindowUntilMidnight_StaysOpenToTheLastMinute()
    {
        Assert.True(PickupHours.IsOpen([Hour(7, 1080, 1440)], Rome, Utc("2026-11-08T22:59:59")));
        Assert.False(PickupHours.IsOpen([Hour(7, 1080, 1440)], Rome, Utc("2026-11-08T23:00:00")));
    }

    [Fact]
    public void NextOpening_WithinSevenDays_ReturnsUtcStartOrNull()
    {
        PickupHour[] hours = [Hour(1, 660, 870), Hour(3, 1080, 1320)];
        // Monday 15:00 local: Wednesday 18:00 local is 17:00 UTC.
        Assert.Equal(Utc("2026-11-04T17:00:00").UtcDateTime, PickupHours.NextOpening(hours, Rome, Utc("2026-11-02T14:00:00")));
        // Between Monday's opening and Wednesday's: the same weekday a week later still counts.
        Assert.Equal(Utc("2026-11-09T10:00:00").UtcDateTime, PickupHours.NextOpening([Hour(1, 660, 870)], Rome, Utc("2026-11-02T14:00:00")));
        // Exactly at an opening, the next one is later.
        Assert.Equal(Utc("2026-11-04T17:00:00").UtcDateTime, PickupHours.NextOpening(hours, Rome, Utc("2026-11-02T10:00:00")));
        Assert.Null(PickupHours.NextOpening([], Rome, Utc("2026-11-02T10:00:00")));
    }

    [Fact]
    public void NextOpening_InsideSkippedHour_MovesToEndOfJump()
    {
        // 28 March 2027: clocks go from 02:00 straight to 03:00, so 02:30 never happens that night.
        var next = PickupHours.NextOpening([Hour(7, 150, 600)], Rome, Utc("2027-03-27T22:00:00"));
        Assert.Equal(Utc("2027-03-28T01:00:00").UtcDateTime, next); // 03:00 summer time
    }

    [Fact]
    public void NextOpening_InsideRepeatedHour_UsesFirstOccurrence()
    {
        // 25 October 2026: 02:00–03:00 happens twice; the first 02:30 is still summer time.
        var next = PickupHours.NextOpening([Hour(7, 150, 600)], Rome, Utc("2026-10-24T21:00:00"));
        Assert.Equal(Utc("2026-10-25T00:30:00").UtcDateTime, next);
    }

    [Fact]
    public void Validate_WeekRules_AcceptTouchingWindowsAndRejectTheRest()
    {
        var id = Guid.NewGuid();
        var saved = PickupHours.Validate(id, [new(2, 1, 660, 900), new(2, 2, 900, 1440), new(5, 1, 0, 60)]);
        Assert.All(saved, h => Assert.Equal(id, h.RestaurantId));
        PickupHourInput?[][] invalid =
        [
            [new(2, 2, 660, 900)],                      // a second window without a first
            [new(2, 1, 660, 900), new(2, 2, 899, 1000)], // overlapping
            [new(2, 1, 900, 900)],                      // empty
            [new(2, 1, 900, 1441)],                     // past midnight
            [new(0, 1, 60, 120)],                       // no such weekday
            [new(2, 3, 60, 120)],                       // no third window
            [new(2, 1, 60, 120), new(2, 1, 200, 300)],  // duplicate slot
            [null],
            [.. Enumerable.Range(0, 15).Select(i => new PickupHourInput(1 + i % 7, 1, i, i + 1))]
        ];
        foreach (var hours in invalid)
            Assert.Equal("VALIDATION_FAILED", Assert.Throws<ApiException>(() => PickupHours.Validate(id, hours)).Code);
        Assert.Throws<ApiException>(() => PickupHours.Validate(id, null));
    }

    [Fact]
    public void Availability_Order_SuspendedThenServiceThenPauseThenHours()
    {
        var restaurant = new Restaurant { Name = "R", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Suspended,
            PickupEnabled = false, PickupPaused = true };
        PickupHour[] always = [.. Enumerable.Range(1, 7).Select(d => Hour(d, 0, 1440))];
        var now = Utc("2026-11-02T10:00:00");
        Assert.Equal(PickupStatus.Suspended, PickupHours.Availability(restaurant, always, now).Status);
        restaurant.ServiceStatus = RestaurantServiceStatus.Active;
        Assert.Equal(PickupStatus.NotOffered, PickupHours.Availability(restaurant, always, now).Status);
        restaurant.PickupEnabled = true;
        Assert.Equal(PickupStatus.Paused, PickupHours.Availability(restaurant, always, now).Status);
        restaurant.PickupPaused = false;
        Assert.Equal(new PickupAvailability(PickupStatus.Open, null), PickupHours.Availability(restaurant, always, now));
        Assert.Equal(new PickupAvailability(PickupStatus.ClosedHours, Utc("2026-11-09T10:00:00").UtcDateTime),
            PickupHours.Availability(restaurant, [Hour(1, 660, 870)], Utc("2026-11-02T14:00:00")));
        Assert.Equal("CLOSED_HOURS", ApiEnum.Text(PickupStatus.ClosedHours));
    }
}
