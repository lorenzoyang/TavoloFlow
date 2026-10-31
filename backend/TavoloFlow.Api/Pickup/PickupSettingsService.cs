using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;

namespace TavoloFlow.Api.Pickup;

public sealed class PickupSettingsService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<PickupSettingsResponse> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var result = await SettingsAsync(restaurantId, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    public async Task<PickupSettingsResponse> SetPausedAsync(Guid restaurantId, bool paused, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockOfferedAsync(restaurantId, ct);
        await db.Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.PickupPaused, paused), ct);
        var result = await SettingsAsync(restaurantId, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    // The owner saves the whole week at once; the new rows replace every old one.
    public async Task<PickupSettingsResponse> SaveHoursAsync(Guid restaurantId, PickupHourInput?[]? input, CancellationToken ct)
    {
        var hours = PickupHours.Validate(restaurantId, input);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockOfferedAsync(restaurantId, ct);
        await db.PickupHours.Where(h => h.RestaurantId == restaurantId).ExecuteDeleteAsync(ct);
        db.PickupHours.AddRange(hours);
        await db.SaveChangesAsync(ct);
        var result = await SettingsAsync(restaurantId, ct);
        await tx.CommitAsync(ct);
        return result;
    }

    // UPDATE waits for the restaurant SHARE lock every submission and acceptance holds, so a submission sees
    // either the old or the new settings, never half of a change.
    private async Task LockOfferedAsync(Guid restaurantId, CancellationToken ct)
    {
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        if (!restaurant.PickupEnabled) throw PickupErrors.NotOffered();
    }

    private async Task<PickupSettingsResponse> SettingsAsync(Guid restaurantId, CancellationToken ct)
    {
        var restaurant = await db.Restaurants.AsNoTracking().SingleAsync(r => r.Id == restaurantId, ct);
        var hours = await db.PickupHours.AsNoTracking().Where(h => h.RestaurantId == restaurantId)
            .OrderBy(h => h.Weekday).ThenBy(h => h.Slot).ToArrayAsync(ct);
        var availability = PickupHours.Availability(restaurant, hours, clock.GetUtcNow());
        return new(restaurant.PickupEnabled, restaurant.Slug, restaurant.Phone, restaurant.PickupPaused,
            hours.Select(PickupHourResponse.From).ToArray(), ApiEnum.Text(availability.Status),
            availability.NextOpensAt, restaurant.TimeZone);
    }
}
