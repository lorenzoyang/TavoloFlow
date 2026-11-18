using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// The only copy of the delivery rules shared by the OWNER's settings, the online menu, submissions and
// the staff pending list.
public static class OnlineDelivery
{
    // Fee bands by road distance from the restaurant: at most five, up to 30 km.
    public const int MaxTiers = 5;
    public const int MaxMeters = 30_000;

    // Coordinates pasted from Google Maps keep six decimals, about ten centimetres.
    public const int OriginDecimals = 6;

    // Repeated by ck_restaurant_delivery_min_order.
    public static bool ValidMinOrder(long? cents) =>
        cents is null or (>= 1 and <= InputRules.MaxSafeCents);

    // The minimum is about whether the trip is worth it, so it compares what the restaurant receives for
    // the dishes: after the coupon, never counting the fee. Pickup orders have no minimum.
    public static bool MeetsMinimum(long itemsCents, int? couponPercentOff, long? minOrderCents) =>
        minOrderCents is not { } minimum
        || itemsCents
            - (
                couponPercentOff is { } percent
                    ? OnlineCoupons.DiscountCents(itemsCents, percent)
                    : 0
            )
            >= minimum;

    // Both set and in range, or both null; rounded to six decimals. Null when invalid.
    public static (decimal? Lat, decimal? Lng)? Origin(decimal? lat, decimal? lng)
    {
        if (lat is null && lng is null)
            return (null, null);
        if (lat is not { } latitude || lng is not { } longitude)
            return null;
        latitude = Math.Round(latitude, OriginDecimals, MidpointRounding.AwayFromZero);
        longitude = Math.Round(longitude, OriginDecimals, MidpointRounding.AwayFromZero);
        return latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180
            ? (latitude, longitude)
            : null;
    }

    // Up to five bands, each 1 m to 30 km with a fee from 0 (free) within the safe-integer range, at
    // distinct distances; returned nearest first. Null when invalid.
    public static (int MaxMeters, long FeeCents)[]? Tiers(DeliveryTierInput?[]? input)
    {
        if (input is null || input.Length > MaxTiers || input.Any(t => t is null))
            return null;
        var tiers = input
            .Select(t => (MaxMeters: t!.MaxMeters ?? 0, FeeCents: t.FeeCents ?? -1))
            .OrderBy(t => t.MaxMeters)
            .ToArray();
        return
            tiers.All(t =>
                t.MaxMeters is >= 1 and <= MaxMeters
                && t.FeeCents is >= 0 and <= InputRules.MaxSafeCents
            )
            && tiers.Select(t => t.MaxMeters).Distinct().Count() == tiers.Length
            ? tiers
            : null;
    }

    public static Task<DeliveryTierResponse[]> TiersAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        CancellationToken ct
    ) =>
        db
            .DeliveryTiers.AsNoTracking()
            .Where(t => t.RestaurantId == restaurantId)
            .OrderBy(t => t.MaxMeters)
            .Select(t => new DeliveryTierResponse(t.MaxMeters, t.FeeCents))
            .ToArrayAsync(ct);
}
