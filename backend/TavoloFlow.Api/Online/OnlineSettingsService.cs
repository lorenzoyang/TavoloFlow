using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// The restaurant's online ordering settings: public phone and weekly hours (OWNER), pause (STAFF, OWNER).
// Every write locks the restaurant row (UPDATE), so a submission holding restaurant SHARE sees either the
// old or the new settings, and the platform cannot turn the service off halfway through a write.
public sealed class OnlineSettingsService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<OnlineSettingsResponse> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var restaurant =
            await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Id == restaurantId, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        var hours = await HoursAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return Response(restaurant, hours);
    }

    public async Task<OnlineSettingsResponse> SetHoursAsync(
        Guid restaurantId,
        OnlineHoursInput input,
        CancellationToken ct
    )
    {
        var slots = ValidHours(input.Slots);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        await db.OnlineHours.Where(h => h.RestaurantId == restaurantId).ExecuteDeleteAsync(ct);
        db.OnlineHours.AddRange(
            slots
                .GroupBy(s => s.Weekday)
                .SelectMany(day =>
                    day.OrderBy(s => s.OpensMinute)
                        .Select(
                            (s, index) =>
                                new OnlineHour
                                {
                                    RestaurantId = restaurantId,
                                    Weekday = s.Weekday,
                                    Slot = index + 1,
                                    OpensMinute = s.OpensMinute,
                                    ClosesMinute = s.ClosesMinute,
                                }
                        )
                )
        );
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Response(restaurant, slots);
    }

    public async Task<OnlineSettingsResponse> SetPhoneAsync(
        Guid restaurantId,
        string? phone,
        CancellationToken ct
    )
    {
        string? value = null;
        if (!string.IsNullOrWhiteSpace(phone))
            value =
                InputRules.NormalizePhone(phone)
                ?? throw ApiException.Validation(
                    "Enter the phone as an optional + and 6-15 digits.",
                    "publicPhone",
                    "Invalid phone."
                );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.PublicPhone, value), ct);
        var hours = await HoursAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        restaurant.PublicPhone = value;
        return Response(restaurant, hours);
    }

    // The pause lasts until a computed moment and then lapses by itself, so nobody has to remember to resume.
    public async Task<OnlineSettingsResponse> PauseAsync(
        Guid restaurantId,
        string until,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        var hours = await HoursAsync(restaurantId, ct);
        var now = clock.GetUtcNow();
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        var local = OnlineSchedule.Local(zone, now);
        DateTime pausedUntil;
        if (until == "SLOT")
            pausedUntil = OnlineSchedule.Current(hours, local) is { } slot
                ? OnlineSchedule.SlotEndUtc(slot, local, zone)
                : throw OnlineErrors.Closed();
        else
            pausedUntil = OnlineSchedule.EndOfDayUtc(local, zone);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlinePausedUntil, pausedUntil), ct);
        await transaction.CommitAsync(ct);
        restaurant.OnlinePausedUntil = pausedUntil;
        return Response(restaurant, hours);
    }

    public async Task<OnlineSettingsResponse> ResumeAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlinePausedUntil, (DateTime?)null), ct);
        var hours = await HoursAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        restaurant.OnlinePausedUntil = null;
        return Response(restaurant, hours);
    }

    private async Task<Restaurant> LockOfferedAsync(Guid restaurantId, CancellationToken ct)
    {
        var restaurant =
            await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        return restaurant.OnlineEnabled ? restaurant : throw OnlineErrors.NotOffered();
    }

    private async Task<OnlineSlot[]> HoursAsync(Guid restaurantId, CancellationToken ct) =>
        await db
            .OnlineHours.AsNoTracking()
            .Where(h => h.RestaurantId == restaurantId)
            .OrderBy(h => h.Weekday)
            .ThenBy(h => h.OpensMinute)
            .Select(h => new OnlineSlot(h.Weekday, h.OpensMinute, h.ClosesMinute))
            .ToArrayAsync(ct);

    private OnlineSettingsResponse Response(Restaurant restaurant, OnlineSlot[] hours)
    {
        var now = clock.GetUtcNow();
        var availability = OnlineAvailability.Evaluate(restaurant, hours, now);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        var local = OnlineSchedule.Local(zone, now);
        var current = OnlineSchedule.Current(hours, local);
        return new(
            restaurant.Slug,
            restaurant.PublicPhone,
            hours
                .OrderBy(h => h.Weekday)
                .ThenBy(h => h.OpensMinute)
                .Select(h => new OnlineHourResponse(h.Weekday, h.OpensMinute, h.ClosesMinute))
                .ToArray(),
            OnlineAvailability.IsPaused(restaurant, now) ? restaurant.OnlinePausedUntil : null,
            availability.Status,
            availability.NextOpensAt,
            current is { } slot ? OnlineSchedule.SlotEndUtc(slot, local, zone) : null
        );
    }

    // Each weekday has at most two slots that neither overlap nor cross midnight; the second may start
    // exactly when the first ends.
    private static OnlineSlot[] ValidHours(OnlineHourInput?[]? input)
    {
        if (input is null || input.Any(s => s is null))
            throw InvalidHours();
        var slots = input
            .Select(s => new OnlineSlot(s!.Weekday ?? 0, s.OpensMinute ?? -1, s.ClosesMinute ?? -1))
            .ToArray();
        if (
            slots.Any(s =>
                s.Weekday is < 1 or > 7
                || s.OpensMinute < 0
                || s.OpensMinute >= s.ClosesMinute
                || s.ClosesMinute > OnlineSchedule.MinutesPerDay
            )
        )
            throw InvalidHours();
        foreach (var day in slots.GroupBy(s => s.Weekday))
        {
            var ordered = day.OrderBy(s => s.OpensMinute).ToArray();
            if (
                ordered.Length > 2
                || (ordered.Length == 2 && ordered[1].OpensMinute < ordered[0].ClosesMinute)
            )
                throw InvalidHours();
        }
        return slots.OrderBy(s => s.Weekday).ThenBy(s => s.OpensMinute).ToArray();
    }

    private static ApiException InvalidHours() =>
        ApiException.Validation(
            "Each weekday takes at most two slots that start before they end and do not overlap.",
            "slots",
            "Invalid hours."
        );
}
