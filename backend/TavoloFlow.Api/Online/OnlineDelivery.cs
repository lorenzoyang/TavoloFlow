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

    // Automatic quotes: only a house number or a named place is precise enough to price, and only when
    // the street matched with this confidence (a typo can otherwise land on another street). Both rules
    // come from the Prato spike in docs/zh-CN/online-ordering-design.md §12 step 11; adjust them with real orders.
    public static readonly string[] QuotableMatches = ["building", "amenity"];
    public const double MinStreetConfidence = 0.9;

    // The search circle reaches a little beyond the farthest band: road distance is never shorter than
    // the straight line, so a match out there is priced as out of range rather than not found. A precise
    // match found only without the circle is out of range without a route.
    public const int SearchMarginMeters = 5000;

    // The language of the towns quotes name: every restaurant is in Italy (EUR, Europe/Rome), so towns
    // read as customers write them and as street signs show them ("Firenze", never "Florence").
    public const string PlaceNamesLanguage = "it";

    // The mean Earth radius, for straight-line distances between coordinates.
    public const double EarthRadiusMeters = 6_371_008.8;

    // The straight-line (great-circle) distance between two points, in metres.
    public static double StraightMeters(decimal lat1, decimal lng1, double lat2, double lng2)
    {
        static double Radians(double degrees) => degrees * Math.PI / 180;
        var dLat = Radians(lat2 - (double)lat1);
        var dLng = Radians(lng2 - (double)lng1);
        var a =
            Math.Pow(Math.Sin(dLat / 2), 2)
            + Math.Cos(Radians((double)lat1))
                * Math.Cos(Radians(lat2))
                * Math.Pow(Math.Sin(dLng / 2), 2);
        return 2 * EarthRadiusMeters * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    // Trimmed, with runs of whitespace collapsed: what a quote is bound to. Null when blank.
    public static string? NormalizeAddress(string? value)
    {
        var parts = value?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return parts is { Length: > 0 } ? string.Join(' ', parts) : null;
    }

    // The nearest band that reaches the road distance; null beyond the farthest band.
    public static DeliveryTierResponse? TierForDistance(
        IEnumerable<DeliveryTierResponse> tiers,
        int meters
    ) => tiers.OrderBy(t => t.MaxMeters).FirstOrDefault(t => meters <= t.MaxMeters);

    // Repeated by ck_restaurant_delivery_min_order.
    public static bool ValidMinOrder(long? cents) =>
        cents is null or (>= 1 and <= InputRules.MaxSafeCents);

    // Both delivery thresholds use the dishes after the coupon, excluding the delivery fee.
    public static long DiscountedItemsCents(long itemsCents, int? couponPercentOff) =>
        itemsCents
        - (couponPercentOff is { } percent ? OnlineCoupons.DiscountCents(itemsCents, percent) : 0);

    public static bool FeeFits(long itemsCents, long feeCents) =>
        feeCents >= 0 && feeCents <= InputRules.MaxSafeCents - itemsCents;

    public static long FeeForTier(DeliveryTierResponse tier, long discountedItemsCents) =>
        tier.FreeDeliveryMinCents is { } minimum && discountedItemsCents >= minimum
            ? 0
            : tier.FeeCents;

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
    public static DeliveryTierResponse[]? Tiers(DeliveryTierInput?[]? input)
    {
        if (input is null || input.Length > MaxTiers || input.Any(t => t is null))
            return null;
        var tiers = input
            .Select(t => new DeliveryTierResponse(
                t!.MaxMeters ?? 0,
                t.FeeCents ?? -1,
                t.FreeDeliveryMinCents
            ))
            .OrderBy(t => t.MaxMeters)
            .ToArray();
        return
            tiers.All(t =>
                t.MaxMeters is >= 1 and <= MaxMeters
                && t.FeeCents is >= 0 and <= InputRules.MaxSafeCents
                && ValidMinOrder(t.FreeDeliveryMinCents)
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
            .Select(t => new DeliveryTierResponse(t.MaxMeters, t.FeeCents, t.FreeDeliveryMinCents))
            .ToArrayAsync(ct);
}
