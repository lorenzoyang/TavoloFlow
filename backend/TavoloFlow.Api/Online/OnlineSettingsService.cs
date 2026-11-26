using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// The restaurant's online ordering settings: public phone, weekly hours, delivery and coupons (OWNER),
// pause (STAFF, OWNER).
// Every write locks the restaurant row (UPDATE), so a submission holding restaurant SHARE sees either the
// old or the new settings, and the platform cannot turn the service off halfway through a write.
public sealed class OnlineSettingsService(
    ApplicationDbContext db,
    TimeProvider clock,
    IDeliveryRouting routing
)
{
    public async Task<OnlineSettingsResponse> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var response = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return response;
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
        var response = await ResponseAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    public async Task<OnlineSettingsResponse> SetPickupAsync(
        Guid restaurantId,
        OnlinePickupInput input,
        CancellationToken ct
    )
    {
        if (input.MinNoticeMinutes is { } minutes && !OnlinePickup.NoticeChoices.Contains(minutes))
            throw ApiException.Validation(
                "Choose a listed notice period.",
                "minNoticeMinutes",
                "Invalid period."
            );
        if (input.MaxDaysAhead is { } days && days is not (1 or 7))
            throw ApiException.Validation(
                "Choose a listed last reservation day.",
                "maxDaysAhead",
                "Invalid day."
            );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        var maxDaysAhead = input.MinNoticeMinutes is null
            ? restaurant.PickupMaxDaysAhead
            : input.MaxDaysAhead ?? restaurant.PickupMaxDaysAhead;
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(r => r.PickupMinNoticeMinutes, input.MinNoticeMinutes)
                        .SetProperty(r => r.PickupMaxDaysAhead, maxDaysAhead),
                ct
            );
        var result = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return result;
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
        await LockOfferedAsync(restaurantId, ct);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.PublicPhone, value), ct);
        var response = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    // Turning delivery off only stops new delivery submissions: waiting delivery requests can still be
    // accepted or rejected, and accepted ones close as usual. The bands are replaced whole, like the week.
    public async Task<OnlineSettingsResponse> SetDeliveryAsync(
        Guid restaurantId,
        OnlineDeliveryInput input,
        CancellationToken ct
    )
    {
        var zh = DeliveryNote(input.NoteZh, "noteZh");
        var it = DeliveryNote(input.NoteIt, "noteIt");
        var en = DeliveryNote(input.NoteEn, "noteEn");
        var minOrder = OnlineDelivery.ValidMinOrder(input.MinOrderCents)
            ? input.MinOrderCents
            : throw ApiException.Validation(
                "Enter the minimum order in whole cents above 0, or null for none.",
                "minOrderCents",
                "Invalid minimum."
            );
        var (lat, lng) =
            OnlineDelivery.Origin(input.OriginLat, input.OriginLng)
            ?? throw ApiException.Validation(
                "Send both coordinates (latitude -90 to 90, longitude -180 to 180), or neither.",
                "originLat",
                "Invalid coordinates."
            );
        var tiers =
            OnlineDelivery.Tiers(input.Tiers)
            ?? throw ApiException.Validation(
                $"Send at most {OnlineDelivery.MaxTiers} tiers at distinct distances of 1 to {OnlineDelivery.MaxMeters} metres, with a non-negative fee and an optional positive free-delivery minimum in cents.",
                "tiers",
                "Invalid tiers."
            );
        var enabled = input.Enabled!.Value;
        // The same request carries the switch and its setup, so a contradiction is invalid input.
        if (enabled && (lat is null || tiers.Length == 0))
            throw ApiException.Validation(
                "Delivery needs the restaurant's coordinates and at least one tier.",
                "enabled",
                "Setup incomplete."
            );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockOfferedAsync(restaurantId, ct);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(r => r.DeliveryEnabled, enabled)
                        .SetProperty(r => r.DeliveryNoteZh, zh)
                        .SetProperty(r => r.DeliveryNoteIt, it)
                        .SetProperty(r => r.DeliveryNoteEn, en)
                        .SetProperty(r => r.DeliveryMinOrderCents, minOrder)
                        .SetProperty(r => r.DeliveryOriginLat, lat)
                        .SetProperty(r => r.DeliveryOriginLng, lng),
                ct
            );
        await db.DeliveryTiers.Where(t => t.RestaurantId == restaurantId).ExecuteDeleteAsync(ct);
        db.DeliveryTiers.AddRange(
            tiers.Select(t => new DeliveryTier
            {
                RestaurantId = restaurantId,
                MaxMeters = t.MaxMeters,
                FeeCents = t.FeeCents,
                FreeDeliveryMinCents = t.FreeDeliveryMinCents,
            })
        );
        await db.SaveChangesAsync(ct);
        var response = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    // Codes are unique per restaurant and a restaurant keeps at most 50; the restaurant UPDATE lock
    // serializes coupon writes, so both checks hold. A submission holding restaurant SHARE sees the
    // coupon either fully created or not at all.
    public async Task<OnlineSettingsResponse> CreateCouponAsync(
        Guid restaurantId,
        OnlineCouponInput input,
        CancellationToken ct
    )
    {
        var code =
            OnlineCoupons.Normalize(input.Code)
            ?? throw ApiException.Validation(
                "Enter a code of 3-20 letters or digits.",
                "code",
                "Invalid code."
            );
        if (!OnlineCoupons.ValidPercent(input.PercentOff))
            throw ApiException.Validation(
                $"Enter a whole percentage from {OnlineCoupons.MinPercent} to {OnlineCoupons.MaxPercent}.",
                "percentOff",
                "Invalid percentage."
            );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        if (input.ValidUntil is { } last && last < BusinessDate(restaurant))
            throw ApiException.Validation(
                "The last valid day can't be before the restaurant's today.",
                "validUntil",
                "In the past."
            );
        var codes = await db
            .OnlineCoupons.Where(c => c.RestaurantId == restaurantId)
            .Select(c => c.Code)
            .ToArrayAsync(ct);
        if (codes.Contains(code))
            throw OnlineErrors.CouponCodeTaken();
        if (codes.Length >= OnlineCoupons.MaxCoupons)
            throw OnlineErrors.CouponLimit();
        db.OnlineCoupons.Add(
            new OnlineCoupon
            {
                Id = Guid.CreateVersion7(),
                RestaurantId = restaurantId,
                Code = code,
                PercentOff = input.PercentOff!.Value,
                ValidUntil = input.ValidUntil,
            }
        );
        await db.SaveChangesAsync(ct);
        var response = await ResponseAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    // Deleting a coupon that is already gone reaches the same target, so it returns the settings too.
    // Requests and bills keep the code and percentage they copied.
    public async Task<OnlineSettingsResponse> DeleteCouponAsync(
        Guid restaurantId,
        Guid id,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await LockOfferedAsync(restaurantId, ct);
        await db
            .OnlineCoupons.Where(c => c.RestaurantId == restaurantId && c.Id == id)
            .ExecuteDeleteAsync(ct);
        var response = await ResponseAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    private DateOnly BusinessDate(Restaurant restaurant) =>
        DateOnly.FromDateTime(
            OnlineSchedule.Local(
                TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone),
                clock.GetUtcNow()
            )
        );

    private static string? DeliveryNote(string? value, string field)
    {
        var note = InputRules.TrimToNull(value);
        return note?.Length > InputRules.MaxDeliveryNoteLength
            ? throw ApiException.Validation(
                "Each delivery note takes at most 500 characters.",
                field,
                "Too long."
            )
            : note;
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
        var hours = await OnlineAvailability.HoursAsync(db, restaurantId, ct);
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
        var response = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    public async Task<OnlineSettingsResponse> ResumeAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockOfferedAsync(restaurantId, ct);
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlinePausedUntil, (DateTime?)null), ct);
        var response = await ResponseAsync(restaurantId, ct);
        await transaction.CommitAsync(ct);
        return response;
    }

    private async Task<Restaurant> LockOfferedAsync(Guid restaurantId, CancellationToken ct)
    {
        var restaurant =
            await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        return restaurant.OnlineEnabled ? restaurant : throw OnlineErrors.NotOffered();
    }

    // ExecuteUpdate changes the database directly. Read its persisted values in the same transaction.
    private async Task<OnlineSettingsResponse> ResponseAsync(
        Guid restaurantId,
        CancellationToken ct
    )
    {
        var restaurant =
            await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Id == restaurantId, ct)
            ?? throw DiningErrors.RestaurantNotFound();
        return await ResponseAsync(restaurant, ct);
    }

    // Reads the hours and waiting requests in the caller's transaction, after its write.
    private async Task<OnlineSettingsResponse> ResponseAsync(
        Restaurant restaurant,
        CancellationToken ct
    )
    {
        var now = clock.GetUtcNow();
        var (hours, availability) = await OnlineAvailability.ReadAsync(db, restaurant, now, ct);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        var local = OnlineSchedule.Local(zone, now);
        var current = OnlineSchedule.Current(hours, local);
        var today = DateOnly.FromDateTime(local);
        var coupons = await db
            .OnlineCoupons.AsNoTracking()
            .Where(c => c.RestaurantId == restaurant.Id)
            .OrderBy(c => c.Code)
            .ToArrayAsync(ct);
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
            current is { } slot ? OnlineSchedule.SlotEndUtc(slot, local, zone) : null,
            restaurant.DeliveryEnabled,
            restaurant.DeliveryNoteZh,
            restaurant.DeliveryNoteIt,
            restaurant.DeliveryNoteEn,
            restaurant.DeliveryMinOrderCents,
            restaurant.DeliveryOriginLat,
            restaurant.DeliveryOriginLng,
            await OnlineDelivery.TiersAsync(db, restaurant.Id, ct),
            routing.Enabled,
            coupons
                .Select(c => new OnlineCouponResponse(
                    c.Id,
                    c.Code,
                    c.PercentOff,
                    c.ValidUntil,
                    !OnlineCoupons.IsValid(c, today)
                ))
                .ToArray(),
            restaurant.PickupMinNoticeMinutes,
            restaurant.PickupMaxDaysAhead
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
