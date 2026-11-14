using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineScheduleTests
{
    private static readonly TimeZoneInfo Rome = TimeZoneInfo.FindSystemTimeZoneById("Europe/Rome");

    // Monday 16 November 2026 in Rome (CET, UTC+1).
    private static DateTime Monday(int hour, int minute = 0) => new(2026, 11, 16, hour, minute, 0);

    private static readonly OnlineSlot[] Week =
    [
        new(1, 12 * 60, 15 * 60),
        new(1, 18 * 60, 1440),
        new(3, 12 * 60, 15 * 60),
    ];

    private static DateTime Utc(int year, int month, int day, int hour, int minute = 0) =>
        new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(11, 59, null)]
    [InlineData(12, 0, 720)]
    [InlineData(14, 59, 720)]
    [InlineData(15, 0, null)]
    [InlineData(18, 0, 1080)]
    [InlineData(23, 59, 1080)]
    public void Current_LocalMinute_OpensInclusiveClosesExclusive(
        int hour,
        int minute,
        int? opensMinute
    ) => Assert.Equal(opensMinute, OnlineSchedule.Current(Week, Monday(hour, minute))?.OpensMinute);

    [Fact]
    public void Current_AdjacentSlots_SecondStartsWhenFirstEnds()
    {
        OnlineSlot[] slots = [new(1, 720, 900), new(1, 900, 1200)];
        Assert.Equal(900, OnlineSchedule.Current(slots, Monday(15))?.OpensMinute);
    }

    [Fact]
    public void Weekday_Sunday_IsSeven()
    {
        Assert.Equal(1, OnlineSchedule.Weekday(Monday(12)));
        Assert.Equal(7, OnlineSchedule.Weekday(new DateTime(2026, 11, 22)));
    }

    [Fact]
    public void SlotEnd_ClosesAtMidnight_EndsAtNextLocalMidnight()
    {
        var slot = OnlineSchedule.Current(Week, Monday(20))!.Value;
        Assert.Equal(Utc(2026, 11, 16, 23), OnlineSchedule.SlotEndUtc(slot, Monday(20), Rome));
        Assert.Equal(
            Utc(2026, 11, 16, 14),
            OnlineSchedule.SlotEndUtc(Week[0], Monday(12, 30), Rome)
        );
    }

    [Fact]
    public void NextOpensAt_LaterTodayNextDayAndNextWeek()
    {
        Assert.Equal(Utc(2026, 11, 16, 17), OnlineSchedule.NextOpensAt(Week, Monday(16), Rome));
        Assert.Equal(Utc(2026, 11, 16, 11), OnlineSchedule.NextOpensAt(Week, Monday(9), Rome));
        // After Monday's last start, Wednesday comes next.
        Assert.Equal(Utc(2026, 11, 18, 11), OnlineSchedule.NextOpensAt(Week, Monday(19), Rome));
        // A single weekly slot that just started returns the same weekday next week.
        Assert.Equal(
            Utc(2026, 11, 23, 11),
            OnlineSchedule.NextOpensAt([new(1, 720, 900)], Monday(12, 1), Rome)
        );
        Assert.Null(OnlineSchedule.NextOpensAt([], Monday(12), Rome));
    }

    [Fact]
    public void ToUtc_SpringForwardGap_MovesToTheJump()
    {
        // 29 March 2026: Rome jumps from 02:00 CET to 03:00 CEST, so 02:30 does not exist.
        Assert.Equal(Utc(2026, 3, 29, 1), OnlineSchedule.ToUtc(new(2026, 3, 29, 2, 30, 0), Rome));
        OnlineSlot[] sunday = [new(7, 150, 240)];
        Assert.Equal(
            Utc(2026, 3, 29, 1),
            OnlineSchedule.NextOpensAt(sunday, new DateTime(2026, 3, 28, 23, 0, 0), Rome)
        );
        Assert.Equal(Utc(2026, 3, 29, 10), OnlineSchedule.ToUtc(new(2026, 3, 29, 12, 0, 0), Rome));
    }

    [Fact]
    public void ToUtc_FallBackRepeatedHour_TakesTheFirstOccurrence()
    {
        // 25 October 2026: Rome goes back from 03:00 CEST to 02:00 CET, so 02:30 happens twice.
        Assert.Equal(
            Utc(2026, 10, 25, 0, 30),
            OnlineSchedule.ToUtc(new(2026, 10, 25, 2, 30, 0), Rome)
        );
        Assert.Equal(
            Utc(2026, 10, 25, 11),
            OnlineSchedule.ToUtc(new(2026, 10, 25, 12, 0, 0), Rome)
        );
    }

    [Fact]
    public void EndOfDay_AcrossDst_IsTheNextLocalMidnight()
    {
        Assert.Equal(
            Utc(2026, 3, 28, 23),
            OnlineSchedule.EndOfDayUtc(new DateTime(2026, 3, 28, 20, 0, 0), Rome)
        );
        Assert.Equal(
            Utc(2026, 3, 29, 22),
            OnlineSchedule.EndOfDayUtc(new DateTime(2026, 3, 29, 20, 0, 0), Rome)
        );
        Assert.Equal(
            Utc(2026, 10, 25, 23),
            OnlineSchedule.EndOfDayUtc(new DateTime(2026, 10, 25, 20, 0, 0), Rome)
        );
    }

    [Fact]
    public void Evaluate_RestaurantState_DecidesInPriorityOrder()
    {
        var mondayNoon = new DateTimeOffset(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);
        Restaurant Restaurant() =>
            new()
            {
                Name = "Online",
                DefaultLanguage = "it",
                ServiceStatus = RestaurantServiceStatus.Active,
                OnlineEnabled = true,
                Slug = "online",
                PublicPhone = "+390212345678",
            };
        Assert.Equal(
            new OnlineAvailabilityResult(OnlineStatus.Open, null),
            OnlineAvailability.Evaluate(Restaurant(), Week, mondayNoon)
        );
        var suspended = Restaurant();
        suspended.ServiceStatus = RestaurantServiceStatus.Suspended;
        suspended.PublicPhone = null;
        Assert.Equal(
            OnlineStatus.Suspended,
            OnlineAvailability.Evaluate(suspended, Week, mondayNoon).Status
        );
        var noPhone = Restaurant();
        noPhone.PublicPhone = null;
        Assert.Equal(
            OnlineStatus.NotOffered,
            OnlineAvailability.Evaluate(noPhone, Week, mondayNoon).Status
        );
        var off = Restaurant();
        off.OnlineEnabled = false;
        Assert.Equal(
            OnlineStatus.NotOffered,
            OnlineAvailability.Evaluate(off, Week, mondayNoon).Status
        );
        var paused = Restaurant();
        paused.OnlinePausedUntil = mondayNoon.UtcDateTime.AddMinutes(1);
        Assert.Equal(
            new OnlineAvailabilityResult(OnlineStatus.Paused, null),
            OnlineAvailability.Evaluate(paused, [], mondayNoon)
        );
        // A pause that has passed no longer counts.
        paused.OnlinePausedUntil = mondayNoon.UtcDateTime;
        Assert.Equal(
            OnlineStatus.Open,
            OnlineAvailability.Evaluate(paused, Week, mondayNoon).Status
        );
        Assert.Equal(
            new OnlineAvailabilityResult(OnlineStatus.ClosedHours, Utc(2026, 11, 16, 17)),
            OnlineAvailability.Evaluate(Restaurant(), Week, mondayNoon.AddHours(4))
        );
        Assert.Equal(
            new OnlineAvailabilityResult(OnlineStatus.ClosedHours, null),
            OnlineAvailability.Evaluate(Restaurant(), [], mondayNoon)
        );
    }
}
