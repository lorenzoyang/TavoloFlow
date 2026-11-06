using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Tests;

public sealed class SubscriptionSummaryTests
{
    private static Restaurant Restaurant() =>
        new()
        {
            Id = Guid.NewGuid(),
            Name = "Calendar test",
            DefaultLanguage = "it",
            OwnerContact = "Owner",
            DefaultAnnualFeeCents = 50_000,
            SubscriptionVersion = 4,
        };

    private static RestaurantSubscriptionPeriod Period(
        DateOnly starts,
        DateOnly ends,
        bool paid = false
    ) =>
        new()
        {
            Id = Guid.NewGuid(),
            StartsOn = starts,
            EndsOn = ends,
            Years = 1,
            AmountCents = 50_000,
            PaidOn = paid ? starts : null,
        };

    [Fact]
    public void Summarize_NoPeriods_IsUnconfiguredWithoutFabricatedDebtOrExpiry()
    {
        var today = new DateOnly(2026, 11, 1);
        var result = SubscriptionService.Summarize(Restaurant(), [], today);
        Assert.Equal("UNCONFIGURED", result.ServiceState);
        Assert.Null(result.StartsOn);
        Assert.Null(result.ExpiresOn);
        Assert.Null(result.PaymentState);
        Assert.Equal(0, result.UnpaidPeriodCount);
        Assert.False(result.DueSoon);
        Assert.Equal(4, result.Version);
    }

    [Theory]
    [InlineData(366, "UPCOMING", false)]
    [InlineData(8, "ACTIVE", false)]
    [InlineData(7, "ACTIVE", true)]
    [InlineData(1, "ACTIVE", true)]
    [InlineData(0, "EXPIRED", false)]
    [InlineData(-1, "EXPIRED", false)]
    public void Summarize_ExpiryBoundary_IsExclusiveAndWarnsSevenDaysBefore(
        int remaining,
        string state,
        bool dueSoon
    )
    {
        var end = new DateOnly(2027, 11, 1);
        var today = end.AddDays(-remaining);
        var period = Period(new(2026, 11, 1), end, paid: true);
        var result = SubscriptionService.Summarize(Restaurant(), [period], today);
        Assert.Equal(state, result.ServiceState);
        Assert.Equal(dueSoon, result.DueSoon);
        Assert.Equal("PAID", result.PaymentState);
        Assert.Equal(0, result.UnpaidPeriodCount);
    }

    [Fact]
    public void Summarize_ContiguousRenewals_UsesFinalExpiryWhilePaymentDebtRemainsIndependent()
    {
        var current = Period(new(2026, 11, 1), new(2027, 11, 1));
        var next = Period(new(2027, 11, 1), new(2028, 11, 1));
        var last = Period(new(2028, 11, 1), new(2029, 11, 1), paid: true);
        var result = SubscriptionService.Summarize(
            Restaurant(),
            [last, current, next],
            new(2027, 10, 27)
        );
        Assert.Equal("ACTIVE", result.ServiceState);
        Assert.False(result.DueSoon);
        Assert.Equal(new DateOnly(2029, 11, 1), result.ExpiresOn);
        Assert.Equal("UNPAID", result.PaymentState);
        Assert.Equal(1, result.UnpaidPeriodCount);
    }

    [Fact]
    public void Summarize_GapAfterCurrentPeriod_DoesNotMergeNoncontiguousExpiry()
    {
        var current = Period(new(2026, 11, 1), new(2027, 11, 1), paid: true);
        var next = Period(new(2027, 11, 2), new(2028, 11, 2), paid: true);
        var result = SubscriptionService.Summarize(
            Restaurant(),
            [current, next],
            new(2027, 10, 27)
        );
        Assert.Equal(new DateOnly(2027, 11, 1), result.ExpiresOn);
        Assert.True(result.DueSoon);
    }

    [Fact]
    public void Summarize_GapBeforeFutureAgreement_KeepsExpiredWarningAndHistoricalUnpaidDebt()
    {
        var previous = Period(new(2025, 11, 1), new(2026, 11, 1));
        var upcoming = Period(new(2026, 12, 1), new(2027, 12, 1), paid: true);
        var result = SubscriptionService.Summarize(
            Restaurant(),
            [upcoming, previous],
            new(2026, 11, 15)
        );
        Assert.Equal("EXPIRED", result.ServiceState);
        Assert.Equal("UNPAID", result.PaymentState);
        Assert.Equal(new DateOnly(2025, 11, 1), result.StartsOn);
        Assert.Equal(new DateOnly(2026, 11, 1), result.ExpiresOn);
        Assert.Equal(1, result.UnpaidPeriodCount);
        Assert.False(result.DueSoon);
    }

    [Theory]
    [InlineData("2026-03-28T23:30:00Z", "2026-03-29")]
    [InlineData("2026-03-29T00:30:00Z", "2026-03-29")]
    [InlineData("2026-03-29T01:30:00Z", "2026-03-29")]
    [InlineData("2026-10-24T22:30:00Z", "2026-10-25")]
    [InlineData("2026-10-25T00:30:00Z", "2026-10-25")]
    [InlineData("2026-10-25T01:30:00Z", "2026-10-25")]
    [InlineData("2028-02-28T23:30:00Z", "2028-02-29")]
    public void LocalDate_RomeDstAndLeapDay_FollowsLocalCalendar(string utc, string expected)
    {
        var today = SubscriptionService.LocalDate("Europe/Rome", DateTimeOffset.Parse(utc));
        Assert.Equal(DateOnly.Parse(expected), today);
        var period = Period(today, today.AddYears(1));
        var result = SubscriptionService.Summarize(Restaurant(), [period], today);
        Assert.Equal("ACTIVE", result.ServiceState);
        Assert.Equal(1, result.UnpaidPeriodCount);
    }
}
