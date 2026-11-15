namespace TavoloFlow.Api.Entities;

// A coupon code the owner shares for online orders: a percentage off the dishes, usable any number of
// times until its optional last day or until the owner deletes it. Submissions copy the code and percentage
// into the request, so deleting or expiring a coupon never changes requests or bills that used it.
public sealed class OnlineCoupon
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }

    // Uppercase letters and digits (Online/OnlineCoupons.Normalize); unique per restaurant.
    public required string Code { get; set; }
    public int PercentOff { get; set; }

    // The last local business date it can be used, inclusive; null never expires.
    public DateOnly? ValidUntil { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
}
